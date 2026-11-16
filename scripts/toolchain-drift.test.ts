import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const toolchainTablePath = path.join(repositoryRoot, "scripts", "toolchain-table.md");
const toolchainHeading = "### Toolchain versions (E15)";

/**
 * Table rows the standard marks not applicable to Snug, with the reason
 * recorded in ADR 0035.
 */
const notApplicableRows: ReadonlyMap<string, string> = new Map([
  ["@oxlint/plugins", "Snug's local Oxlint plugins import nothing from @oxlint/plugins"],
]);

/**
 * The files a toolchain drift check reads, already loaded.
 */
interface ToolchainSources {
  /**
   * Parsed `package.json` files keyed by repo-relative path; `package.json` is the root.
   */
  readonly manifests: ReadonlyMap<string, unknown>;
  /**
   * The raw content of `.node-version`.
   */
  readonly nodeVersion: string;
  /**
   * Workflow file contents keyed by their repo-relative path.
   */
  readonly workflows: ReadonlyMap<string, string>;
}

/**
 * Reads one table line as a tool and version pair.
 * @param line A Markdown line of the toolchain section.
 * @returns The tool without backticks and the first token of its version, or
 *   undefined for a header, separator or non-table line.
 */
function parseTableRow(line: string): [string, string] | undefined {
  const cells = line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
  const [toolCell = "", versionCell = ""] = cells;
  const isDataRow = cells.length === 2 && toolCell !== "Tool" && !/^-+$/.test(toolCell);
  if (!isDataRow) return undefined;
  const version = versionCell.replaceAll("`", "").split(/\s+/, 1)[0] ?? "";
  return [toolCell.replaceAll("`", ""), version];
}

/**
 * Parses the `### Toolchain versions (E15)` table.
 * @param markdown A Markdown document holding the table.
 * @returns Tool name to version, in table order.
 */
function parseToolchainTable(markdown: string): Map<string, string> {
  const start = markdown.indexOf(toolchainHeading);
  if (start === -1) {
    throw new Error(`the toolchain table has no "${toolchainHeading}" section`);
  }
  const end = markdown.indexOf("\n#", start + toolchainHeading.length);
  const section = markdown.slice(start, end === -1 ? undefined : end);
  const rows = section.split("\n").map((line) => parseTableRow(line));
  return new Map(rows.filter((row) => row !== undefined));
}

/**
 * Reads a field of a parsed JSON object.
 * @param value The parsed JSON value.
 * @param key The field name.
 * @returns The field, or undefined when `value` is not an object.
 */
function fieldOf(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  const field: unknown = Reflect.get(value, key);
  return field;
}

/**
 * Reads a string field of a parsed JSON object.
 * @param value The parsed JSON value.
 * @param key The field name.
 * @returns The field when it is a string, otherwise undefined.
 */
function stringField(value: unknown, key: string): string | undefined {
  const field = fieldOf(value, key);
  return typeof field === "string" ? field : undefined;
}

/**
 * Picks the root manifest, the one that owns `packageManager` and the catalog.
 * @param sources The loaded toolchain sources.
 * @returns The parsed root `package.json`.
 */
function rootManifest(sources: ToolchainSources): unknown {
  return sources.manifests.get("package.json");
}

/**
 * Reads a dependency's declared range from a manifest's dependency groups,
 * resolving `catalog:` through the root manifest's workspace catalog.
 * @param manifest The parsed manifest.
 * @param packageName The dependency name.
 * @param sources The loaded toolchain sources, for the catalog.
 * @returns The declared or catalog range, or undefined when not declared.
 */
function declaredRange(
  manifest: unknown,
  packageName: string,
  sources: ToolchainSources,
): string | undefined {
  const catalog = fieldOf(fieldOf(rootManifest(sources), "workspaces"), "catalog");
  for (const group of ["devDependencies", "dependencies", "peerDependencies"]) {
    const range = stringField(fieldOf(manifest, group), packageName);
    if (range === "catalog:") return stringField(catalog, packageName) ?? range;
    if (range !== undefined) return range;
  }
  return undefined;
}

/**
 * Packages pinned exactly (E6, the Toolchain pin group); others may carry a caret range.
 */
const exactPins = new Set([
  "oxlint",
  "@oxlint/plugins",
  "oxfmt",
  "oxlint-tsgolint",
  "typescript7",
  "typescript",
  "@types/bun",
]);

/**
 * Checks a dependency row in the root manifest and in every workspace that declares it.
 * @param tool The dependency name.
 * @param version The table version.
 * @param sources The loaded toolchain sources.
 * @returns One message per mismatch.
 */
function checkPackageRow(tool: string, version: string, sources: ToolchainSources): string[] {
  const missing =
    declaredRange(rootManifest(sources), tool, sources) === undefined
      ? [`package.json does not declare ${tool} (table: ${version})`]
      : [];
  const mismatched: string[] = [];
  for (const [file, manifest] of sources.manifests) {
    const range = declaredRange(manifest, tool, sources);
    if (range === undefined) continue;
    const declared = exactPins.has(tool) ? range : range.replace(/^\^/, "");
    if (declared !== version) mismatched.push(`${file} ${tool} is ${range}, table says ${version}`);
  }
  return [...missing, ...mismatched];
}

/**
 * Collects every value of `pattern`'s first group across workflows.
 * @param workflows Workflow contents keyed by path.
 * @param pattern A global pattern whose first group is the value.
 * @returns Each value with the file it came from.
 */
function workflowValues(
  workflows: ReadonlyMap<string, string>,
  pattern: RegExp,
): { file: string; value: string }[] {
  return workflows
    .entries()
    .flatMap(([file, text]) =>
      text.matchAll(pattern).map((match) => ({ file, value: match[1] ?? "" })),
    )
    .toArray();
}

/**
 * Checks that every workflow occurrence of `pattern` carries `version`, and that one exists.
 * @param tool The tool name, for messages.
 * @param version The table version.
 * @param pattern A global pattern whose first group is the pinned version.
 * @param sources The loaded toolchain sources.
 * @returns One message per mismatch, or one when no workflow pins the tool.
 */
function checkWorkflowRow(
  tool: string,
  version: string,
  pattern: RegExp,
  sources: ToolchainSources,
): string[] {
  const found = workflowValues(sources.workflows, pattern);
  return found.length === 0
    ? [`no workflow pins ${tool} (table: ${version})`]
    : found
        .filter(({ value }) => value !== version)
        .map(({ file, value }) => `${file} pins ${tool} ${value}, table says ${version}`);
}

/**
 * Checks the `.node-version` row and that every `setup-node` step reads `.node-version`.
 * @param version The table version.
 * @param sources The loaded toolchain sources.
 * @returns One message per mismatch.
 */
function checkNodeRow(version: string, sources: ToolchainSources): string[] {
  const declared = sources.nodeVersion.trim();
  const fileProblems =
    declared === version ? [] : [`.node-version is ${declared}, table says ${version}`];
  const hardCoded = workflowValues(sources.workflows, /^\s*node-version:\s*(\S+)/gm).map(
    ({ file }) => `${file} sets node-version directly instead of reading .node-version`,
  );
  const otherFiles = workflowValues(sources.workflows, /^\s*node-version-file:\s*(\S+)/gm)
    .filter(({ value }) => value !== ".node-version")
    .map(({ file, value }) => `${file} reads node-version-file ${value}`);
  return [...fileProblems, ...hardCoded, ...otherFiles];
}

/**
 * Matches a zizmor pin either as a `ZIZMOR_VERSION` env entry or as the
 * `version` input of `zizmorcore/zizmor-action`, without its leading `v`.
 */
const zizmorPin =
  /(?:^\s*ZIZMOR_VERSION:\s*|zizmorcore\/zizmor-action@[^\n]+\n\s+with:\n\s+version:\s*)["']?v?([^\s"']+)/gm;

/**
 * Checks one table row against its source.
 * @param tool The table's tool cell.
 * @param version The table's version.
 * @param sources The loaded toolchain sources.
 * @returns One message per mismatch.
 */
function checkRow(tool: string, version: string, sources: ToolchainSources): string[] {
  switch (tool) {
    case "Bun (packageManager)": {
      const packageManager = stringField(rootManifest(sources), "packageManager");
      return packageManager === version
        ? []
        : [`package.json packageManager is ${String(packageManager)}, table says ${version}`];
    }
    case ".node-version": {
      return checkNodeRow(version, sources);
    }
    case "actionlint": {
      return checkWorkflowRow(
        tool,
        version,
        /^\s*ACTIONLINT_VERSION:\s*["']?([^\s"']+)/gm,
        sources,
      );
    }
    case "zizmor": {
      return checkWorkflowRow(tool, version, zizmorPin, sources);
    }
    case "lycheeverse/lychee-action": {
      return checkWorkflowRow(tool, version, /lycheeverse\/lychee-action@([0-9a-f]+)/g, sources);
    }
    default: {
      return checkPackageRow(tool, version, sources);
    }
  }
}

/**
 * Compares the repository's toolchain with the table, skipping not-applicable rows.
 * @param table Tool name to version.
 * @param sources The loaded toolchain sources.
 * @returns One message per place where the toolchain differs from the table.
 */
function findToolchainDrift(
  table: ReadonlyMap<string, string>,
  sources: ToolchainSources,
): string[] {
  return table.size === 0
    ? ["the toolchain table is empty"]
    : [...table]
        .filter(([tool]) => !notApplicableRows.has(tool))
        .flatMap(([tool, version]) => checkRow(tool, version, sources));
}

/**
 * Lists the `.yml`/`.yaml` files under a directory, recursively.
 * @param directory An absolute directory path.
 * @returns Absolute file paths.
 */
function yamlFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, encoding: "utf8" })
    .filter((name) => /\.ya?ml$/.test(name))
    .map((name) => path.join(directory, name));
}

/**
 * Lists the root and every workspace `package.json`.
 * @returns Repo-relative manifest paths, the root first.
 */
function manifestPaths(): string[] {
  const workspaces = ["apps", "packages"].flatMap((parent) =>
    readdirSync(path.join(repositoryRoot, parent), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(parent, entry.name, "package.json")),
  );
  return ["package.json", ...workspaces];
}

/**
 * Loads the repository's real toolchain sources.
 * @returns The manifests, `.node-version` and every workflow.
 */
function readRepositorySources(): ToolchainSources {
  const workflowFiles = yamlFiles(path.join(repositoryRoot, ".github", "workflows"));
  return {
    manifests: new Map(
      manifestPaths().map((file) => [
        file,
        JSON.parse(readFileSync(path.join(repositoryRoot, file), "utf8")) as unknown,
      ]),
    ),
    nodeVersion: readFileSync(path.join(repositoryRoot, ".node-version"), "utf8"),
    workflows: new Map(
      workflowFiles.map((file) => [
        path.relative(repositoryRoot, file),
        readFileSync(file, "utf8"),
      ]),
    ),
  };
}

const sampleTable = [
  "# Tooling",
  "",
  toolchainHeading,
  "",
  "| Tool | Version |",
  "| ---- | ------- |",
  "| `oxfmt` | 0.75.0 |",
  "| `@oxlint/plugins` | 1.92.0 |",
  "| `typescript` | `npm:@typescript/typescript6@6.0.2` |",
  "| Bun (`packageManager`) | `bun@1.4.4` |",
  "| `.node-version` | 26 |",
  "| actionlint | 1.7.12 |",
  "| zizmor | 1.32.0 |",
  "| `lycheeverse/lychee-action` | `e747` (v2.9.0) |",
  "",
  "## Next",
  "",
  "| `ignored` | 9 |",
].join("\n");

const sampleWorkflow = [
  "      - uses: actions/setup-node@abc",
  "        with:",
  "          node-version-file: .node-version",
  "          ACTIONLINT_VERSION: 1.7.12",
  "      - uses: zizmorcore/zizmor-action@def # v0.8.1",
  "        with:",
  "          version: v1.32.0",
  "      - uses: lycheeverse/lychee-action@e747 # v2.9.0",
  "",
].join("\n");

/**
 * Builds a root manifest that matches `sampleTable`.
 * @param overrides Fields to replace.
 * @returns The manifest.
 */
function sampleRoot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    packageManager: "bun@1.4.4",
    workspaces: {
      catalog: { typescript: "npm:@typescript/typescript6@6.0.2" },
    },
    devDependencies: { oxfmt: "0.75.0", typescript: "catalog:" },
    ...overrides,
  };
}

/**
 * Builds sources that match `sampleTable`.
 * @param overrides Manifests, `.node-version` or workflows that replace the matching sample.
 * @returns Sources with no drift against `sampleTable` unless overridden.
 */
function sampleSources(overrides: Partial<ToolchainSources> = {}): ToolchainSources {
  return {
    manifests: new Map<string, unknown>([
      ["package.json", sampleRoot()],
      ["apps/web/package.json", { devDependencies: { typescript: "catalog:" } }],
    ]),
    nodeVersion: "26\n",
    workflows: new Map([["ci.yml", sampleWorkflow]]),
    ...overrides,
  };
}

/**
 * Runs the drift check on the sample table against mutated sample sources.
 * @param overrides Sources to replace.
 * @returns The drift messages.
 */
function sampleDrift(overrides: Partial<ToolchainSources>): string[] {
  return findToolchainDrift(parseToolchainTable(sampleTable), sampleSources(overrides));
}

describe("toolchain drift (E15)", () => {
  test("parses only the toolchain table, without backticks or version notes", () => {
    expect([...parseToolchainTable(sampleTable)]).toEqual([
      ["oxfmt", "0.75.0"],
      ["@oxlint/plugins", "1.92.0"],
      ["typescript", "npm:@typescript/typescript6@6.0.2"],
      ["Bun (packageManager)", "bun@1.4.4"],
      [".node-version", "26"],
      ["actionlint", "1.7.12"],
      ["zizmor", "1.32.0"],
      ["lycheeverse/lychee-action", "e747"],
    ]);
  });

  test("matching sources have no drift, and not-applicable rows are skipped", () => {
    expect(sampleDrift({})).toEqual([]);
  });

  test("WHEN oxfmt in package.json differs from the table THEN the drift check fails", () => {
    const manifests = new Map<string, unknown>([
      [
        "package.json",
        sampleRoot({
          devDependencies: { oxfmt: "0.74.0", typescript: "catalog:" },
        }),
      ],
    ]);
    expect(sampleDrift({ manifests })).toEqual(["package.json oxfmt is 0.74.0, table says 0.75.0"]);
  });

  test("an exact pin may not become a range", () => {
    const manifests = new Map<string, unknown>([
      [
        "package.json",
        sampleRoot({
          devDependencies: { oxfmt: "^0.75.0", typescript: "catalog:" },
        }),
      ],
    ]);
    expect(sampleDrift({ manifests })).toEqual([
      "package.json oxfmt is ^0.75.0, table says 0.75.0",
    ]);
  });

  test("WHEN the catalog entry differs THEN every manifest using it drifts", () => {
    const manifests = new Map<string, unknown>([
      ["package.json", sampleRoot({ workspaces: { catalog: { typescript: "^6.0.3" } } })],
      ["apps/web/package.json", { devDependencies: { typescript: "catalog:" } }],
    ]);
    expect(sampleDrift({ manifests })).toEqual([
      "package.json typescript is ^6.0.3, table says npm:@typescript/typescript6@6.0.2",
      "apps/web/package.json typescript is ^6.0.3, table says npm:@typescript/typescript6@6.0.2",
    ]);
  });

  test("WHEN a workspace pins its own version THEN the drift check fails", () => {
    const manifests = new Map<string, unknown>([
      ["package.json", sampleRoot()],
      ["apps/web/package.json", { devDependencies: { oxfmt: "0.70.0" } }],
    ]);
    expect(sampleDrift({ manifests })).toEqual([
      "apps/web/package.json oxfmt is 0.70.0, table says 0.75.0",
    ]);
  });

  test("WHEN packageManager differs THEN the drift check fails", () => {
    const manifests = new Map<string, unknown>([
      ["package.json", sampleRoot({ packageManager: "bun@1.4.3" })],
    ]);
    expect(sampleDrift({ manifests })).toEqual([
      "package.json packageManager is bun@1.4.3, table says bun@1.4.4",
    ]);
  });

  test("flags .node-version, workflow pins and a hard-coded node-version", () => {
    const drift = sampleDrift({
      nodeVersion: "24\n",
      workflows: new Map([
        [
          "ci.yml",
          [
            "        with:",
            "          node-version: 24",
            "          ACTIONLINT_VERSION: 1.7.11",
            "      - uses: zizmorcore/zizmor-action@def # v0.8.1",
            "        with:",
            "          version: v1.31.0",
            "      - uses: lycheeverse/lychee-action@f00 # v2.8.0",
            "",
          ].join("\n"),
        ],
      ]),
    });
    expect(drift).toEqual([
      ".node-version is 24, table says 26",
      "ci.yml sets node-version directly instead of reading .node-version",
      "ci.yml pins actionlint 1.7.11, table says 1.7.12",
      "ci.yml pins zizmor 1.31.0, table says 1.32.0",
      "ci.yml pins lycheeverse/lychee-action f00, table says e747",
    ]);
  });

  test("a table row with no source is drift", () => {
    const drift = sampleDrift({ workflows: new Map(), manifests: new Map() });
    expect(drift).toContain("package.json does not declare oxfmt (table: 0.75.0)");
    expect(drift).toContain("no workflow pins actionlint (table: 1.7.12)");
    expect(drift).toContain("no workflow pins zizmor (table: 1.32.0)");
  });

  test("every not-applicable row names a row of the vendored table", () => {
    const table = parseToolchainTable(readFileSync(toolchainTablePath, "utf8"));
    expect(
      notApplicableRows
        .keys()
        .filter((tool) => !table.has(tool))
        .toArray(),
    ).toEqual([]);
  });

  test("the repo matches the vendored toolchain table", () => {
    const table = parseToolchainTable(readFileSync(toolchainTablePath, "utf8"));
    expect(table.size).toBeGreaterThanOrEqual(12);
    expect(findToolchainDrift(table, readRepositorySources())).toEqual([]);
  });
});

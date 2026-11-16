import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { isRecord, parseJsonAs, parseJsonRecord } from "./json-guards";
const REPO_ROOT = path.resolve(import.meta.dirname, "..");

const readRepositoryFile = (relativePath: string): string =>
  readFileSync(path.join(REPO_ROOT, relativePath), "utf8");

const STALE_NAME_PATTERN = /(?<![\w-])(?:forge|andryore-starter)(?![\w])/i;
const TEXT_EXTENSIONS = new Set([
  ".md",
  ".mdx",
  ".ts",
  ".tsx",
  ".mjs",
  ".js",
  ".json",
  ".jsonc",
  ".json5",
  ".yml",
  ".yaml",
  ".astro",
  ".css",
  ".txt",
  ".sh",
  ".csv",
]);

/**
 * Paths where the old names are allowed. ADRs and the changelog record the
 * past, this file names them on purpose, and `.claude/skills/` is vendored
 * third-party text.
 */
const ALLOWED_PATHS: ReadonlySet<string> = new Set([
  "CHANGELOG.md",
  "scripts/standard-invariants.test.ts",
]);
const ALLOWED_PREFIXES: readonly string[] = ["docs/adr/", ".claude/skills/"];

/**
 * Returns the lines of a file's text that mention a stale name as a whole
 * word, so words such as "forget" or "forged" never match.
 * @param text - The file contents.
 * @returns The 1-based line numbers that mention a stale name.
 */
const findStaleNameLines = (text: string): number[] =>
  text.split("\n").flatMap((line, index) => (STALE_NAME_PATTERN.test(line) ? index + 1 : []));

const isAllowed = (file: string): boolean =>
  ALLOWED_PATHS.has(file) || ALLOWED_PREFIXES.some((prefix) => file.startsWith(prefix));

const listTrackedTextFiles = (): string[] =>
  execFileSync("git", ["ls-files", "-z"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\0")
    .filter(
      (file) =>
        file !== "" && TEXT_EXTENSIONS.has(path.extname(file)) && !file.endsWith("bun.lock"),
    );

describe("stale names", () => {
  it('keeps "forge" and "andryore-starter" out of every file outside ADRs and the changelog', () => {
    const offenders = listTrackedTextFiles()
      .filter((file) => !isAllowed(file))
      .flatMap((file) => {
        const lines = findStaleNameLines(readRepositoryFile(file));
        return lines.map((line) => `${file}:${line}`);
      });
    expect(offenders).toEqual([]);
  });
});

describe("findStaleNameLines", () => {
  it("flags the whole words and the slash command", () => {
    expect(findStaleNameLines("a\nrun /forge now\nthe Forge docs")).toEqual([2, 3]);
  });

  it("flags andryore-starter", () => {
    expect(findStaleNameLines("from andryore-starter")).toEqual([1]);
  });

  it("ignores unrelated words", () => {
    expect(findStaleNameLines("forget forged forgery reforge")).toEqual([]);
  });
});

const PRODUCT_PACKAGES = ["package.json", "apps/extension/package.json"];

const readApprovedCopy = (copyMarkdown: string, label: string): string | undefined => {
  const row = new RegExp(String.raw`^\|\s*${label}\s*\|\s*(.+?)\s*\|\s*$`, "m");
  return row.exec(copyMarkdown)?.[1];
};

const readReadmeSlogan = (readme: string): string | undefined =>
  /^\*\*(.+)\*\*$/m.exec(readme)?.[1];

const readExtensionDescription = (): string | undefined =>
  parseJsonAs(
    readRepositoryFile("apps/extension/locales/en.json"),
    (value): value is { extensionDescription?: { message?: string } } => isRecord(value),
  ).extensionDescription?.message;

describe("copy drift", () => {
  const copyMarkdown = readRepositoryFile("docs/brand/copy.md");
  const approvedSlogan = readApprovedCopy(copyMarkdown, "Slogan");
  const approvedDescription = readApprovedCopy(copyMarkdown, "One-line description");

  it("copy.md names the approved slogan and one-line description", () => {
    expect(approvedSlogan).toBeTruthy();
    expect(approvedDescription).toBeTruthy();
  });

  it("the README slogan equals the slogan in copy.md", () => {
    expect(readReadmeSlogan(readRepositoryFile("README.md"))).toBe(approvedSlogan);
  });

  it("the README slogan equals the extension manifest description", () => {
    expect(readReadmeSlogan(readRepositoryFile("README.md"))).toBe(readExtensionDescription());
  });

  it.each(PRODUCT_PACKAGES)(
    "%s description equals the one-line description in copy.md",
    (packagePath) => {
      const manifest = parseJsonAs(
        readRepositoryFile(packagePath),
        (value): value is { description?: string } => isRecord(value),
      );
      expect(manifest.description).toBe(approvedDescription);
    },
  );

  it("detects drift in the slogan", () => {
    const drifted = copyMarkdown.replace(approvedSlogan ?? "", "A different slogan.");
    expect(readApprovedCopy(drifted, "Slogan")).not.toBe(
      readReadmeSlogan(readRepositoryFile("README.md")),
    );
  });

  it("reads no slogan from a README without a bold line", () => {
    expect(readReadmeSlogan("# Title\n\nplain text")).toBeUndefined();
  });
});

const DOCS_DIRECTORY = path.join(REPO_ROOT, "docs");
const DOCUMENT_EXTENSIONS = new Set([".md", ".csv", ".html"]);
const MARKDOWN_LINK_PATTERN = /\]\(([^)\s#]+)(?:#[^)\s]*)?\)/g;

/**
 * Directories the index covers with a single link to the directory. Every
 * other document must be linked by its own path. `docs/adr/` has its own
 * index, `docs/brand/` is owned by the brand kit and grows without touching
 * this test, and `docs/store/listings/` holds one file per locale.
 */
const DIRECTORY_COVERED: readonly string[] = ["docs/adr", "docs/brand", "docs/store/listings"];

/**
 * Documents outside `docs/` that the index must also link.
 */
const EXTRA_INDEXED: readonly string[] = ["PRODUCT.md", "apps/site/DESIGN.md"];

/**
 * Lists every document under a directory as a repo-relative POSIX path.
 * @param directory - The absolute directory to walk.
 * @returns The repo-relative paths of its documents, nested ones included.
 */
const listDocuments = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listDocuments(fullPath);
    if (!DOCUMENT_EXTENSIONS.has(path.extname(entry.name))) return [];
    return path.relative(REPO_ROOT, fullPath).split(path.sep).join("/");
  });

/**
 * Resolves the relative targets of every Markdown link in the index to
 * repo-relative POSIX paths, without a trailing slash.
 * @param markdown - The index Markdown.
 * @returns The set of local link targets.
 */
const resolveLinkTargets = (markdown: string): Set<string> => {
  const targets = new Set<string>();
  for (const match of markdown.matchAll(MARKDOWN_LINK_PATTERN)) {
    const target = match[1];
    if (target === undefined || /^[a-z][a-z\d+.-]*:/i.test(target)) continue;
    const resolved = path.posix.normalize(path.posix.join("docs", target));
    targets.add(resolved.replace(/\/$/, ""));
  }
  return targets;
};

/**
 * Returns the documents the index neither links nor covers by directory.
 * @param documents - Repo-relative document paths.
 * @param linkTargets - The index's resolved link targets.
 * @returns The documents missing from the index.
 */
const findUnindexedDocuments = (
  documents: readonly string[],
  linkTargets: ReadonlySet<string>,
): string[] =>
  documents.filter(
    (document) =>
      !linkTargets.has(document) &&
      DIRECTORY_COVERED.every(
        (directory) => !document.startsWith(`${directory}/`) || !linkTargets.has(directory),
      ),
  );

describe("docs index", () => {
  const linkTargets = resolveLinkTargets(readRepositoryFile("docs/README.md"));

  it("links every document under docs/, covering docs/brand/ by directory rule", () => {
    const documents = listDocuments(DOCS_DIRECTORY);
    expect(documents).toContain("docs/README.md");
    expect(
      findUnindexedDocuments(
        documents.filter((document) => document !== "docs/README.md"),
        linkTargets,
      ),
    ).toEqual([]);
  });

  it("links the documents that live outside docs/", () => {
    expect(EXTRA_INDEXED.filter((file) => !linkTargets.has(file))).toEqual([]);
  });

  it("links only files and directories that exist", () => {
    const missing = [...linkTargets].filter((target) => !existsSync(path.join(REPO_ROOT, target)));
    expect(missing).toEqual([]);
  });

  it("links each directory-covered directory", () => {
    expect(DIRECTORY_COVERED.filter((directory) => !linkTargets.has(directory))).toEqual([]);
  });
});

describe("findUnindexedDocuments", () => {
  it("reports a document that is not linked", () => {
    expect(findUnindexedDocuments(["docs/new.md"], new Set(["docs/usage.md"]))).toEqual([
      "docs/new.md",
    ]);
  });

  it("accepts a document linked by its own path", () => {
    expect(findUnindexedDocuments(["docs/usage.md"], new Set(["docs/usage.md"]))).toEqual([]);
  });

  it("accepts a new file under a directory-covered directory", () => {
    expect(findUnindexedDocuments(["docs/brand/og/notes.md"], new Set(["docs/brand"]))).toEqual([]);
  });

  it("reports a file under a covered directory when the directory is not linked", () => {
    expect(findUnindexedDocuments(["docs/brand/voice.md"], new Set())).toEqual([
      "docs/brand/voice.md",
    ]);
  });

  it("does not extend directory coverage to other directories", () => {
    expect(findUnindexedDocuments(["docs/launch/new.md"], new Set(["docs/brand"]))).toEqual([
      "docs/launch/new.md",
    ]);
  });
});

describe("resolveLinkTargets", () => {
  it("resolves relative links against docs/ and ignores anchors and URLs", () => {
    const targets = resolveLinkTargets(
      "[a](usage.md#x) [b](../PRODUCT.md) [c](brand/) [d](https://example.com/x.md)",
    );
    expect([...targets].toSorted((left, right) => left.localeCompare(right))).toEqual([
      "docs/brand",
      "docs/usage.md",
      "PRODUCT.md",
    ]);
  });
});

/**
 * Skills committed under `.claude/skills` that are intentionally absent from
 * `skills-lock.json`, keyed by directory name with the reason.
 */
const UNLOCKED_SKILLS: Readonly<Record<string, string>> = {
  "playwright-trace": "Vendored with the Playwright skills in #52 without a lock entry.",
};

interface SkillsDisagreement {
  lockedButMissing: string[];
  installedButUnlocked: string[];
}

const sortNames = (left: string, right: string): number => left.localeCompare(right);

const compareSkills = (
  locked: readonly string[],
  installed: readonly string[],
  unlocked: Readonly<Record<string, string>> = {},
): SkillsDisagreement => ({
  lockedButMissing: locked.filter((name) => !installed.includes(name)).toSorted(sortNames),
  installedButUnlocked: installed
    .filter((name) => !locked.includes(name) && !Object.hasOwn(unlocked, name))
    .toSorted(sortNames),
});

const readLockedSkills = (): string[] => {
  const { skills } = parseJsonRecord(readRepositoryFile("skills-lock.json"));
  if (!isRecord(skills)) {
    throw new Error('skills-lock.json has no "skills" object');
  }
  return Object.keys(skills);
};

const readInstalledSkills = (): string[] =>
  readdirSync(path.join(REPO_ROOT, ".claude/skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

describe("skills lock", () => {
  it("skills-lock.json and .claude/skills agree in both directions", () => {
    expect(compareSkills(readLockedSkills(), readInstalledSkills(), UNLOCKED_SKILLS)).toStrictEqual(
      { lockedButMissing: [], installedButUnlocked: [] },
    );
  });

  it("every unlocked-skill exemption points at an installed skill", () => {
    const installed = readInstalledSkills();
    expect(Object.keys(UNLOCKED_SKILLS).filter((name) => !installed.includes(name))).toStrictEqual(
      [],
    );
  });

  it("compareSkills reports a locked skill with no directory", () => {
    expect(compareSkills(["a", "b"], ["a"])).toStrictEqual({
      lockedButMissing: ["b"],
      installedButUnlocked: [],
    });
  });

  it("compareSkills reports an installed skill with no lock entry", () => {
    expect(compareSkills(["a"], ["a", "c"])).toStrictEqual({
      lockedButMissing: [],
      installedButUnlocked: ["c"],
    });
  });

  it("compareSkills honours an exemption", () => {
    expect(compareSkills(["a"], ["a", "c"], { c: "local" })).toStrictEqual({
      lockedButMissing: [],
      installedButUnlocked: [],
    });
  });
});

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".astro"]);
const ENV_READ_PATTERN =
  /(?:process\.env|import\.meta\.env)(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*\])/g;
const DOCUMENTED_NAME_PATTERN = /`([A-Z][A-Z0-9_]*)`/g;
const IGNORED_PREFIXES: readonly string[] = [".claude/"];

/**
 * Lists the environment variable names a source text reads through
 * `process.env` or `import.meta.env`, by dot or bracket access.
 * @param source - The file contents.
 * @returns The distinct variable names read.
 */
const findEnvironmentReads = (source: string): string[] => {
  const names = new Set<string>();
  for (const match of source.matchAll(ENV_READ_PATTERN)) {
    const name = match[1] ?? match[2];
    if (name !== undefined) names.add(name);
  }
  return [...names];
};

/**
 * Lists every backticked upper-case name in the configuration document.
 * @param markdown - The contents of `docs/configuration.md`.
 * @returns The set of documented names.
 */
const findDocumentedNames = (markdown: string): Set<string> =>
  new Set(markdown.matchAll(DOCUMENTED_NAME_PATTERN).map((match) => match[1] ?? ""));

const listTrackedCodeFiles = (): string[] =>
  execFileSync("git", ["ls-files", "-z"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\0")
    .filter(
      (file) =>
        file !== "" &&
        CODE_EXTENSIONS.has(path.extname(file)) &&
        IGNORED_PREFIXES.every((prefix) => !file.startsWith(prefix)),
    );

describe("environment variables are documented", () => {
  const documented = findDocumentedNames(
    readFileSync(path.join(REPO_ROOT, "docs/configuration.md"), "utf8"),
  );

  it("documents every variable the code reads in docs/configuration.md", () => {
    const undocumented = listTrackedCodeFiles()
      .filter((file) => file !== "scripts/env-docs.test.ts")
      .flatMap((file) =>
        findEnvironmentReads(readFileSync(path.join(REPO_ROOT, file), "utf8"))
          .filter((name) => !documented.has(name))
          .map((name) => `${file}: ${name}`),
      );
    expect(undocumented).toEqual([]);
  });
});

describe("findEnvironmentReads", () => {
  it("finds dot and bracket access on both env objects", () => {
    expect(
      findEnvironmentReads(
        "process.env.A_B; process.env[\"C\"]; import.meta.env.D; import.meta.env['E']",
      ),
    ).toEqual(["A_B", "C", "D", "E"]);
  });

  it("ignores spreads and unrelated text", () => {
    expect(findEnvironmentReads("{ ...process.env }; const env = 1; envelope.X")).toEqual([]);
  });
});

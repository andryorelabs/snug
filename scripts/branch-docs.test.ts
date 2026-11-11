import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");

function readText(relativePath: string): string {
  return readFileSync(path.resolve(ROOT, relativePath), "utf8");
}

function readStringConstant(source: string, name: string): string {
  const match = new RegExp(`const ${name} = "([^"]*)";`).exec(source);
  if (!match?.[1]) throw new Error(`pre-push.ts has no string constant ${name}`);
  return match[1];
}

function resolveFeatureBranchPattern(prePushSource: string): string {
  const template = /const VALID_BRANCH = new RegExp\(\s*`([^`]*)`,?\s*\)/.exec(prePushSource)?.[1];
  if (!template) throw new Error("pre-push.ts has no VALID_BRANCH template literal");
  const constants = new Map(
    ["SLUG", "CONVENTIONAL_TYPES"].map((name) => [name, readStringConstant(prePushSource, name)]),
  );
  return template
    .replaceAll(/\$\{(\w+)\}/g, (_, name: string) => {
      const value = constants.get(name);
      if (value === undefined) throw new Error(`unknown placeholder ${name}`);
      return value;
    })
    .replaceAll("\\\\", "\\");
}

function findDocumentedPatterns(documentation: string): string[] {
  return documentation
    .split("\n")
    .map((line) => /^(\^\(.*\)\$)$/.exec(line.trim())?.[1] ?? /`(\^\(.*\)\$)`/.exec(line)?.[1])
    .filter((pattern): pattern is string => pattern !== undefined);
}

describe("branch-name regex in docs/development.md", () => {
  const expected = resolveFeatureBranchPattern(readText("scripts/pre-push.ts"));
  const documented = findDocumentedPatterns(readText("docs/development.md"));

  it("is documented in the hooks list and in the branch naming section", () => {
    expect(documented).toHaveLength(2);
  });

  it("equals the feature-branch pattern in scripts/pre-push.ts", () => {
    for (const pattern of documented) expect(pattern).toBe(expected);
  });

  it("does not list main", () => {
    expect(expected).not.toContain("main");
  });
});

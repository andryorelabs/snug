import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, test } from "vitest";

import { shadcnNoRestyleContracts } from "../lint-policy.mjs";
import oxlintConfig from "../oxlint.config";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

interface RestyleOptions {
  readonly contracts: unknown;
}

function restyleContracts(entry: unknown): unknown {
  if (!Array.isArray(entry)) throw new Error("no-restyle has no options");
  return (entry[1] as RestyleOptions).contracts;
}

describe("shared lint policy", () => {
  test("oxlint.config.ts uses the shared no-restyle contracts object", () => {
    const rules = oxlintConfig.overrides?.flatMap((override) =>
      Object.entries(override.rules ?? {}),
    );
    const restyle = rules?.filter(([rule]) => rule === "shadcn/no-restyle");
    const withOptions = restyle?.filter(([, entry]) => Array.isArray(entry));
    expect(withOptions?.length).toBeGreaterThan(0);
    const optionEntries = (withOptions ?? []).map(([, entry]) => entry);
    for (const entry of optionEntries) {
      expect(restyleContracts(entry)).toBe(shadcnNoRestyleContracts);
    }
  });

  test("eslint.config.mjs uses the shared no-restyle contracts object", async () => {
    const loaded = (await import(pathToFileURL(path.join(ROOT, "eslint.config.mjs")).href)) as {
      default: readonly { rules?: Record<string, unknown> }[];
    };
    const blocks = loaded.default;
    const entries = blocks
      .map((block) => block.rules?.["shadcn/no-restyle"])
      .filter((entry) => entry !== undefined);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(restyleContracts(entry)).toBe(shadcnNoRestyleContracts);
    }
  }, 60_000);

  test("keeps one contract per shadcn component and a reason in the policy", () => {
    const patterns = shadcnNoRestyleContracts.map(({ pattern }) => pattern);
    expect(new Set(patterns).size).toBe(patterns.length);
    expect(patterns).toContain("^Button$");
  });
});

describe("config file flavors", () => {
  test("commitlint is a TypeScript config and no .prettierignore remains", () => {
    expect(existsSync(path.join(ROOT, "commitlint.config.ts"))).toBe(true);
    expect(existsSync(path.join(ROOT, "commitlint.config.mjs"))).toBe(false);
    expect(existsSync(path.join(ROOT, ".prettierignore"))).toBe(false);
  });

  test("commitlint extends the conventional preset", async () => {
    const loaded = (await import(pathToFileURL(path.join(ROOT, "commitlint.config.ts")).href)) as {
      default: { extends: readonly string[] };
    };
    expect(loaded.default.extends).toStrictEqual(["@commitlint/config-conventional"]);
  });
});

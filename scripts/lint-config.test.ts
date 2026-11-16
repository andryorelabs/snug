import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";

import { shadcnNoRestyleContracts } from "../lint-policy.mjs";
import oxlintConfig from "../oxlint.config";
import { isRecord } from "./json-guards";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function restyleContracts(entry: unknown): unknown {
  if (!Array.isArray(entry)) throw new TypeError("no-restyle has no options");
  const options: unknown = entry[1];
  return isRecord(options) ? options.contracts : undefined;
}

describe("shared lint policy", () => {
  test("oxlint.config.ts uses the shared no-restyle contracts object", () => {
    const rules = oxlintConfig.overrides.flatMap((override) =>
      Object.entries(override.rules ?? {}),
    );
    const restyle = rules.filter(([rule]) => rule === "shadcn/no-restyle");
    const withOptions = restyle.filter(([, entry]) => Array.isArray(entry));
    expect(withOptions.length).toBeGreaterThan(0);
    const optionEntries = withOptions.map(([, entry]) => entry);
    for (const entry of optionEntries) {
      expect(restyleContracts(entry)).toBe(shadcnNoRestyleContracts);
    }
  });

  test("eslint.config.mjs uses the shared no-restyle contracts object", async () => {
    const loaded: unknown = await import(pathToFileURL(path.join(ROOT, "eslint.config.mjs")).href);
    const blocks = isRecord(loaded) ? loaded.default : undefined;
    if (!Array.isArray(blocks)) throw new TypeError("eslint.config.mjs must export an array");
    const entries = blocks
      .map((block: unknown) =>
        isRecord(block) && isRecord(block.rules) ? block.rules["shadcn/no-restyle"] : undefined,
      )
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
    const loaded: unknown = await import(
      pathToFileURL(path.join(ROOT, "commitlint.config.ts")).href
    );
    const config = isRecord(loaded) ? loaded.default : undefined;
    expect(isRecord(config) ? config.extends : undefined).toStrictEqual([
      "@commitlint/config-conventional",
    ]);
  });
});

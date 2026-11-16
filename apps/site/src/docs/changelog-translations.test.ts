import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "../../../..");
const translationsRoot = path.join(repositoryRoot, "apps/site/src/content/translations");

type GroupShape = readonly number[];

/**
 * Reads, per released version, how many bullets each `###` group holds.
 * @param markdown A changelog in the English or a translated shape.
 * @returns Bullet counts per group, keyed by version.
 */
function bulletsPerGroup(markdown: string): Map<string, GroupShape> {
  const shapes = new Map<string, GroupShape>();
  for (const section of markdown.split(/^## /m).slice(1)) {
    const version = /^\[?(\d+\.\d+\.\d+)/.exec(section)?.[1];
    if (version === undefined) continue;
    const groups = section.split(/^### /m).slice(1);
    shapes.set(
      version,
      groups.map((group) => group.split("\n").filter((line) => line.startsWith("- ")).length),
    );
  }
  return shapes;
}

const english = bulletsPerGroup(readFileSync(path.join(repositoryRoot, "CHANGELOG.md"), "utf8"));
const locales = readdirSync(translationsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

describe("translated CHANGELOG", () => {
  it.each(locales)("%s keeps the English group and bullet counts per version", (locale) => {
    const translated = bulletsPerGroup(
      readFileSync(path.join(translationsRoot, locale, "CHANGELOG.md"), "utf8"),
    );
    expect(translated.size).toBeGreaterThan(0);
    for (const [version, shape] of translated) {
      expect(english.has(version), `${locale} has ${version}, English does not`).toBe(true);
      expect(shape, `${locale} ${version}`).toEqual(english.get(version));
    }
  });
});

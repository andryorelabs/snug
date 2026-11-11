import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..");

const PRODUCT_PACKAGES = ["package.json", "apps/extension/package.json"];

const readRepositoryFile = (relativePath: string) =>
  readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8");

function readApprovedCopy(copyMarkdown: string, label: string): string | undefined {
  const row = new RegExp(String.raw`^\|\s*${label}\s*\|\s*(.+?)\s*\|\s*$`, "m");
  return row.exec(copyMarkdown)?.[1];
}

function readReadmeSlogan(readme: string): string | undefined {
  return /^\*\*(.+)\*\*$/m.exec(readme)?.[1];
}

const copyMarkdown = readRepositoryFile("docs/brand/copy.md");
const approvedSlogan = readApprovedCopy(copyMarkdown, "Slogan");
const approvedDescription = readApprovedCopy(copyMarkdown, "One-line description");

describe("copy drift", () => {
  it("copy.md names the approved slogan and one-line description", () => {
    expect(approvedSlogan).toBeTruthy();
    expect(approvedDescription).toBeTruthy();
  });

  it("the README slogan equals the slogan in copy.md", () => {
    expect(readReadmeSlogan(readRepositoryFile("README.md"))).toBe(approvedSlogan);
  });

  it.each(PRODUCT_PACKAGES)(
    "%s description equals the one-line description in copy.md",
    (packagePath) => {
      const manifest = JSON.parse(readRepositoryFile(packagePath)) as {
        description?: string;
      };
      expect(manifest.description).toBe(approvedDescription);
    },
  );

  it("detects drift in the slogan and the descriptions", () => {
    const drifted = copyMarkdown.replace(approvedSlogan ?? "", "A different slogan.");
    expect(readApprovedCopy(drifted, "Slogan")).not.toBe(
      readReadmeSlogan(readRepositoryFile("README.md")),
    );
  });

  it("reads no slogan from a README without a bold line", () => {
    expect(readReadmeSlogan("# Title\n\nplain text")).toBeUndefined();
  });
});

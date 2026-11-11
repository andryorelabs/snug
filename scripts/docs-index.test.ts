import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const DOCS_DIRECTORY = path.join(REPO_ROOT, "docs");
const INDEX_FILE = path.join(DOCS_DIRECTORY, "README.md");
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
  const indexMarkdown = readFileSync(INDEX_FILE, "utf8");
  const linkTargets = resolveLinkTargets(indexMarkdown);

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

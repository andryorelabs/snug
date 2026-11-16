import { beforeEach, describe, expect, it } from "vitest";

import { resetFakeBookmarks } from "./fake-bookmarks";

describe("fake bookmarks", () => {
  beforeEach(() => {
    resetFakeBookmarks();
  });

  it("rejects a create under an unknown parent", async () => {
    await expect(browser.bookmarks.create({ parentId: "nope", title: "x" })).rejects.toThrow(
      "Parent bookmark folder not found: nope",
    );
  });

  it("finds created nodes by title and removes them with their tree", async () => {
    const folder = await browser.bookmarks.create({
      parentId: "2",
      title: "Reading",
    });
    await browser.bookmarks.create({
      parentId: folder.id,
      title: "Post",
      url: "https://post.example",
    });

    const found = await browser.bookmarks.search({ title: "Reading" });
    expect(found.map((node) => node.id)).toEqual([folder.id]);

    await browser.bookmarks.removeTree(folder.id);
    await expect(browser.bookmarks.search({ title: "Reading" })).resolves.toEqual([]);
  });
});

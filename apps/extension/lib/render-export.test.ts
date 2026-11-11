// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { ExportCanceledError } from "./export-control";
import { EXPORT_FORMATS } from "./export-formats";
import { renderExport } from "./render-export";
import type { RenderExportOptions } from "./render-export";
import { resetFakeBookmarks, seedFakeBookmarksTree } from "./testing/fake-bookmarks";

const options: RenderExportOptions = {
  selectedBookmarks: null,
  includeIconData: false,
  includeDateAdded: false,
  includeDateLastUsed: false,
  includeDateGroupModified: false,
  hideOtherBookmarks: false,
  hideParentFolder: false,
};

beforeEach(() => {
  resetFakeBookmarks();
  seedFakeBookmarksTree([
    {
      id: "10",
      parentId: "1",
      title: "Example",
      url: "https://example.com/",
      syncing: false,
    },
  ]);
});

describe("renderExport", () => {
  it.each(EXPORT_FORMATS)("renders %s text containing the bookmark", async (format) => {
    const text = await renderExport(format, options);

    expect(typeof text).toBe("string");
    expect(text).toContain("https://example.com");
  });

  it("renders JSON as indented, parseable text", async () => {
    const text = await renderExport("json", options);

    expect(text).toContain("\n  ");
    const parsed: unknown = JSON.parse(text);
    expect(parsed).toBeTypeOf("object");
  });

  it("renders Markdown as a bullet list", async () => {
    expect(await renderExport("markdown", options)).toContain("[Example](https://example.com/)");
  });

  it("rejects with ExportCanceledError when aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      renderExport("xbel", { ...options, signal: controller.signal }),
    ).rejects.toBeInstanceOf(ExportCanceledError);
  });
});

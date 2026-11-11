// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { exportAllBookmarks, exportBookmarks, triggerDownload } from "./export-all-bookmarks";
import { ExportCanceledError } from "./export-control";
import { exportFilenameTemplateStore } from "./storage";
import { resetFakeBookmarks, seedFakeBookmarksTree } from "./testing/fake-bookmarks";

interface Download {
  href: string;
  download: string;
}

const downloads: Download[] = [];
const blobs: Blob[] = [];
const revokeObjectUrl = vi.fn();

beforeEach(async () => {
  resetFakeBookmarks();
  downloads.length = 0;
  blobs.length = 0;
  await exportFilenameTemplateStore.setValue("snug-export");
  Object.assign(URL, {
    createObjectURL: (blob: Blob) => {
      blobs.push(blob);
      return "blob:fake";
    },
    revokeObjectURL: revokeObjectUrl,
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push({ href: this.href, download: this.download });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("triggerDownload", () => {
  it("clicks a temporary download link and cleans up after itself", () => {
    triggerDownload("hello", "text/plain", "a.txt");

    expect(downloads).toEqual([{ href: "blob:fake", download: "a.txt" }]);
    expect(blobs[0]?.type).toBe("text/plain");
    expect(document.querySelector("a")).toBeNull();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:fake");
  });
});

describe("exportBookmarks", () => {
  it("downloads the rendered file named from the template and counts bookmarks", async () => {
    seedFakeBookmarksTree([
      {
        id: "10",
        parentId: "1",
        title: "A",
        url: "https://a.example/",
        syncing: false,
      },
      {
        id: "11",
        parentId: "1",
        title: "B",
        url: "https://b.example/",
        syncing: false,
      },
    ]);

    const result = await exportBookmarks("markdown", null);

    expect(result).toEqual({ fileName: "snug-export.md", count: 2 });
    expect(downloads[0]?.download).toBe("snug-export.md");
    expect(blobs[0]?.type).toBe("text/markdown");
    expect(await blobs[0]?.text()).toContain("https://a.example/");
  });

  it("counts and exports only the selection when given", async () => {
    const result = await exportBookmarks("csv", [
      {
        id: "30",
        parentId: "1",
        title: "Only",
        url: "https://only.example/",
        syncing: false,
      },
    ]);

    expect(result.count).toBe(1);
    expect(await blobs[0]?.text()).toContain("https://only.example/");
  });

  it("throws ExportCanceledError without downloading when aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      exportBookmarks("json", null, { signal: controller.signal }),
    ).rejects.toBeInstanceOf(ExportCanceledError);
    expect(downloads).toEqual([]);
  });
});

describe("exportAllBookmarks", () => {
  it("exports the whole tree", async () => {
    seedFakeBookmarksTree([
      {
        id: "10",
        parentId: "1",
        title: "A",
        url: "https://a.example/",
        syncing: false,
      },
    ]);

    await expect(exportAllBookmarks("xbel")).resolves.toEqual({
      fileName: "snug-export.xbel",
      count: 1,
    });
  });
});

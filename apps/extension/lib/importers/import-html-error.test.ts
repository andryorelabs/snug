// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetFakeBookmarks } from "@/lib/testing/fake-bookmarks";

import { importFromHTML } from "./import-html";

describe("importFromHTML load failure", () => {
  beforeEach(() => {
    resetFakeBookmarks();
  });

  it("wraps a failure while reading the live roots in the localized error", async () => {
    vi.spyOn(browser.bookmarks, "getTree").mockRejectedValue(new Error("tree unavailable"));
    await expect(importFromHTML("<DL></DL>")).rejects.toThrow("tree unavailable");
  });
});

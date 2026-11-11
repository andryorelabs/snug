import { describe, expect, it } from "vitest";

import { EXPORT_FORMAT_INFO, EXPORT_FORMATS, POPUP_TOGGLE_FORMAT_LIMIT } from "./export-formats";

describe("export formats", () => {
  it("describes every format with a label, extension and MIME type", () => {
    expect(Object.keys(EXPORT_FORMAT_INFO).toSorted((a, b) => a.localeCompare(b))).toEqual(
      [...EXPORT_FORMATS].toSorted((a, b) => a.localeCompare(b)),
    );
    for (const format of EXPORT_FORMATS) {
      const info = EXPORT_FORMAT_INFO[format];
      expect(info.extension).not.toContain(".");
      expect(info.mimeType).toMatch(/^[a-z]+\/[\w.+-]+$/);
      expect(info.label.length).toBeGreaterThan(0);
    }
  });

  it("maps formats to their file extensions", () => {
    expect(EXPORT_FORMAT_INFO.markdown.extension).toBe("md");
    expect(EXPORT_FORMAT_INFO.html.mimeType).toBe("text/html");
  });

  it("has fewer toggle slots than formats, so the popup falls back to a select", () => {
    expect(POPUP_TOGGLE_FORMAT_LIMIT).toBeLessThan(EXPORT_FORMATS.length);
  });
});

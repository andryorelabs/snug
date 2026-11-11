import { describe, expect, it } from "vitest";

import { THEME_COLORS, themeColor } from "./theme-color";

describe("themeColor", () => {
  it("returns the dark colour for the dark theme", () => {
    expect(themeColor(true)).toBe(THEME_COLORS.dark);
  });

  it("returns the light colour for the light theme", () => {
    expect(themeColor(false)).toBe(THEME_COLORS.light);
  });

  it("uses distinct hex colours", () => {
    expect(THEME_COLORS.light).toMatch(/^#[\da-f]{6}$/);
    expect(THEME_COLORS.dark).toMatch(/^#[\da-f]{6}$/);
    expect(THEME_COLORS.light).not.toBe(THEME_COLORS.dark);
  });
});

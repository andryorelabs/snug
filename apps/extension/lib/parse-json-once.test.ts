import { describe, expect, it } from "vitest";

import { parseJsonOnce } from "./parse-json-once";

describe("parseJsonOnce", () => {
  it("parses JSON text", () => {
    expect(parseJsonOnce('{"a":[1,2]}')).toEqual({ a: [1, 2] });
  });

  it("returns the very same value for the same text", () => {
    const text = '{"shared":true}';
    expect(parseJsonOnce(text)).toBe(parseJsonOnce(text));
  });

  it("parses again for different text", () => {
    expect(parseJsonOnce("[1]")).toEqual([1]);
    expect(parseJsonOnce("[2]")).toEqual([2]);
  });

  it("throws on invalid JSON every time and keeps the last good parse", () => {
    const good = parseJsonOnce('{"ok":1}');
    expect(() => parseJsonOnce("{bad")).toThrow(SyntaxError);
    expect(() => parseJsonOnce("{bad")).toThrow(SyntaxError);
    expect(parseJsonOnce('{"ok":1}')).toBe(good);
  });
});

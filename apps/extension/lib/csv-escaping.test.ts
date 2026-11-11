import { describe, expect, it } from "vitest";

import { escapeFolderSegment, splitFolderPath, unescapeFormulaField } from "./csv-escaping";

describe("escapeFolderSegment", () => {
  it("prefixes slashes and backslashes with a backslash", () => {
    expect(escapeFolderSegment(String.raw`a/b\c`)).toBe(String.raw`a\/b\\c`);
  });

  it("leaves plain titles untouched", () => {
    expect(escapeFolderSegment("Reading list")).toBe("Reading list");
  });
});

describe("splitFolderPath", () => {
  it("splits on unescaped slashes", () => {
    expect(splitFolderPath("a/b/c")).toEqual(["a", "b", "c"]);
  });

  it("unescapes slashes and backslashes inside a segment", () => {
    expect(splitFolderPath(String.raw`a\/b/c\\d`)).toEqual(["a/b", String.raw`c\d`]);
  });

  it("keeps a backslash before any other character literally", () => {
    expect(splitFolderPath(String.raw`a\b/c`)).toEqual([String.raw`a\b`, "c"]);
  });

  it("drops empty segments", () => {
    expect(splitFolderPath("/a//b/")).toEqual(["a", "b"]);
    expect(splitFolderPath("")).toEqual([]);
  });

  it("round-trips escaped segments", () => {
    const titles = ["x/y", String.raw`p\q`, "plain"];
    const joined = titles.map((title) => escapeFolderSegment(title)).join("/");
    expect(splitFolderPath(joined)).toEqual(titles);
  });
});

describe("unescapeFormulaField", () => {
  it.each(["=", "+", "-", "@"])("removes the guard quote before %s", (char) => {
    expect(unescapeFormulaField(`'${char}1`)).toBe(`${char}1`);
  });

  it("leaves other quoted values alone", () => {
    expect(unescapeFormulaField("'hello")).toBe("'hello");
    expect(unescapeFormulaField("=1")).toBe("=1");
  });
});

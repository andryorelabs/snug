import { describe, expect, it } from "vitest";

import { isDirectoryHandle } from "@/lib/is-directory-handle";

describe("isDirectoryHandle", () => {
  it("accepts an object whose kind is directory", () => {
    expect(isDirectoryHandle({ kind: "directory", name: "folder" })).toBe(true);
  });

  it.each([null, undefined, "directory", { kind: "file" }, {}, []])("rejects %j", (value) => {
    expect(isDirectoryHandle(value)).toBe(false);
  });
});

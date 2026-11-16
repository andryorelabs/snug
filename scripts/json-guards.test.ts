import { describe, expect, test } from "vitest";

import { isRecord, parseJsonArray, parseJsonAs, parseJsonRecord } from "./json-guards";

describe("isRecord", () => {
  test("accepts plain objects only", () => {
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord("text")).toBe(false);
  });
});

describe("parseJsonRecord", () => {
  test("returns the parsed object", () => {
    expect(parseJsonRecord('{"version":"1.0.0"}')).toEqual({
      version: "1.0.0",
    });
  });

  test("rejects documents that are not objects", () => {
    expect(() => parseJsonRecord("[]")).toThrow("expected shape");
    expect(() => parseJsonRecord("null")).toThrow("expected shape");
  });
});

describe("parseJsonArray", () => {
  test("returns the parsed array", () => {
    expect(parseJsonArray("[1,2]")).toEqual([1, 2]);
  });

  test("rejects documents that are not arrays", () => {
    expect(() => parseJsonArray("{}")).toThrow("expected shape");
  });
});

const isString = (value: unknown): value is string => typeof value === "string";

describe("parseJsonAs", () => {
  test("runs the guard on the parsed value", () => {
    expect(parseJsonAs('"ok"', isString)).toBe("ok");
    expect(() => parseJsonAs("1", isString)).toThrow("expected shape");
  });
});

import { describe, expect, it } from "vitest";

import { isRecord } from "./guards";

describe("isRecord", () => {
  it("accepts plain objects only", () => {
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord("text")).toBe(false);
  });
});

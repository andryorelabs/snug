import { describe, expect, it } from "vitest";

import { findSequentially, forEachSequentially, reduceSequentially } from "@/lib/sequential";

describe("forEachSequentially", () => {
  it("starts a step only after the previous one settled", async () => {
    const events: string[] = [];
    await forEachSequentially(["a", "b"], async (item) => {
      events.push(`start ${item}`);
      await Promise.resolve();
      events.push(`end ${item}`);
    });
    expect(events).toEqual(["start a", "end a", "start b", "end b"]);
  });

  it("stops at the first rejected step", async () => {
    const visited: number[] = [];
    await expect(
      forEachSequentially([1, 2, 3], (item) => {
        visited.push(item);
        return item === 2 ? Promise.reject(new Error("boom")) : Promise.resolve();
      }),
    ).rejects.toThrow("boom");
    expect(visited).toEqual([1, 2]);
  });
});

describe("reduceSequentially", () => {
  it("threads the accumulator through every step", async () => {
    const total = await reduceSequentially([1, 2, 3], 0, (sum, item) =>
      Promise.resolve(sum + item),
    );
    expect(total).toBe(6);
  });
});

describe("findSequentially", () => {
  it("returns the first match without testing later items", async () => {
    const tested: number[] = [];
    const found = await findSequentially([1, 2, 3], (item) => {
      tested.push(item);
      return Promise.resolve(item === 2);
    });
    expect(found).toBe(2);
    expect(tested).toEqual([1, 2]);
  });

  it("returns undefined when nothing matches", async () => {
    expect(await findSequentially([1, 2], () => Promise.resolve(false))).toBeUndefined();
  });
});

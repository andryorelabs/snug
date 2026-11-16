import { assert, describe, expect, it } from "vitest";

import { createLatestOnly } from "./latest-only";

function deferred<T>() {
  return Promise.withResolvers<T>();
}

describe("createLatestOnly", () => {
  it("returns the value when nothing supersedes the call", async () => {
    const run = createLatestOnly((input: string) => Promise.resolve(input.toUpperCase()));
    await expect(run("a")).resolves.toEqual({ isCurrent: true, value: "A" });
  });

  it("marks the earlier call stale when it resolves after a later one", async () => {
    const pending = {
      A: deferred<string>(),
      B: deferred<string>(),
    };
    const run = createLatestOnly((input: "A" | "B") => pending[input].promise);

    const first = run("A");
    const second = run("B");
    pending.B.resolve("preview-B");
    pending.A.resolve("preview-A");

    await expect(second).resolves.toEqual({
      isCurrent: true,
      value: "preview-B",
    });
    await expect(first).resolves.toEqual({ isCurrent: false });
  });

  it("swallows the error of a superseded call but surfaces the current one", async () => {
    const stale = deferred<string>();
    const current = deferred<string>();
    const queue = [stale, current];
    const run = createLatestOnly(() => {
      const next = queue.shift();
      assert(next);
      return next.promise;
    });

    const first = run("A");
    const second = run("B");
    stale.reject(new Error("stale failure"));
    current.reject(new Error("current failure"));

    await expect(first).resolves.toEqual({ isCurrent: false });
    await expect(second).rejects.toThrow("current failure");
  });
});

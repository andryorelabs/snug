import { expect, it } from "vitest";

import { forwardWith } from "./forward-with.mjs";

it("forwards reads to the frozen target and binds its methods", () => {
  class Target {
    name = "target";

    describe() {
      return this.name;
    }
  }
  const target = Object.freeze(new Target());
  const proxy = forwardWith(target, {});
  expect(Reflect.get(proxy, "name")).toBe("target");
  const describeMethod: unknown = Reflect.get(proxy, "describe");
  if (typeof describeMethod !== "function") throw new TypeError("describe was not forwarded");
  expect(Reflect.apply(describeMethod, undefined, [])).toBe("target");
});

it("returns an override instead of the frozen target value", () => {
  const target = Object.freeze({ value: "original" });
  const proxy = forwardWith(target, { value: "replaced" });
  expect(Reflect.get(proxy, "value")).toBe("replaced");
});

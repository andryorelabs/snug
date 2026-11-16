import { describe, expect, it, vi } from "vitest";

import interactionDirective from "./interaction-directive";

const hydrateOnInteraction = vi.hoisted(() =>
  vi.fn<(root: EventTarget, load: () => Promise<() => Promise<void>>) => void>(),
);

vi.mock("./hydrate-on-interaction", () => ({ hydrateOnInteraction }));

function isElement(value: unknown): value is HTMLElement {
  return value instanceof EventTarget;
}

describe("interaction client directive", () => {
  it("hands the island element and its loader to the interaction hydrator", () => {
    const candidate: unknown = new EventTarget();
    if (!isElement(candidate)) throw new Error("The fake island element is invalid");
    const element = candidate;
    const load = vi.fn<() => Promise<() => Promise<void>>>();

    interactionDirective(load, { name: "interaction", value: "" }, element);

    expect(hydrateOnInteraction).toHaveBeenCalledExactlyOnceWith(element, load);
    expect(load).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { createDomHarness } from "./testing/dom-harness";
import type { DomHarness } from "./testing/dom-harness";
import { useSlashToFocus } from "./use-slash-to-focus";

function Probe({ input }: { input: { current: HTMLElement | null } }) {
  useSlashToFocus(input);
  return null;
}

const mountedHarnesses: DomHarness[] = [];

afterEach(() => {
  for (const harness of mountedHarnesses.splice(0)) harness.unmount();
  document.body.replaceChildren();
});

async function mountWithInput() {
  const harness = createDomHarness();
  mountedHarnesses.push(harness);
  const input = document.createElement("input");
  document.body.append(input);
  await harness.render(createElement(Probe, { input: { current: input } }));
  return input;
}

describe("useSlashToFocus", () => {
  it('focuses the input on "/" and swallows the key', async () => {
    const input = await mountWithInput();
    const event = new KeyboardEvent("keydown", { key: "/", cancelable: true });

    globalThis.dispatchEvent(event);

    expect(document.activeElement).toBe(input);
    expect(event.defaultPrevented).toBe(true);
  });

  it('ignores "/" with a modifier', async () => {
    const input = await mountWithInput();

    globalThis.dispatchEvent(new KeyboardEvent("keydown", { key: "/", ctrlKey: true }));

    expect(document.activeElement).not.toBe(input);
  });

  it("ignores other keys", async () => {
    const input = await mountWithInput();

    globalThis.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));

    expect(document.activeElement).not.toBe(input);
  });

  it('ignores "/" typed inside another text field', async () => {
    const input = await mountWithInput();
    const other = document.createElement("textarea");
    document.body.append(other);
    other.focus();

    other.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "/",
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(document.activeElement).toBe(other);
    expect(document.activeElement).not.toBe(input);
  });

  it("stops listening once unmounted", async () => {
    const input = await mountWithInput();
    for (const harness of mountedHarnesses) harness.unmount();

    globalThis.dispatchEvent(new KeyboardEvent("keydown", { key: "/" }));

    expect(document.activeElement).not.toBe(input);
  });
});

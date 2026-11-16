// @vitest-environment jsdom
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

import { createDomHarness } from "@/lib/testing/dom-harness";
import type { DomHarness } from "@/lib/testing/dom-harness";
import { getFakeBookmarksRoot, resetFakeBookmarks } from "@/lib/testing/fake-bookmarks";

import { DuplicatesRoute } from "./duplicates";

class ResizeObserverStub {
  observe() {
    return;
  }
  unobserve() {
    return;
  }
  disconnect() {
    return;
  }
}

const mountedHarnesses: DomHarness[] = [];

function findButton(label: string): HTMLButtonElement {
  const button = [...document.body.querySelectorAll("button")].find((candidate) =>
    candidate.textContent.includes(label),
  );
  if (!button) throw new Error(`No button containing ${label}`);
  return button;
}

async function openConfirmDialog() {
  const harness = createDomHarness();
  mountedHarnesses.push(harness);
  await harness.render(createElement(DuplicatesRoute));
  await vi.waitFor(() => {
    expect(findButton("duplicates_deleteButton")).toBeTruthy();
  });
  await act(() => {
    findButton("duplicates_deleteButton").click();
    return Promise.resolve();
  });
  await vi.waitFor(() => {
    expect(document.querySelector('[role="alertdialog"]')).not.toBe(null);
  });
}

describe("DuplicatesRoute delete flow", () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    resetFakeBookmarks();
    fakeBrowser.i18n.getMessage = vi.fn<(key: string) => string>((key) => key);
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    const heading = document.createElement("h1");
    heading.tabIndex = -1;
    document.body.append(heading);
    const [bar] = getFakeBookmarksRoot().children ?? [];
    if (!bar) throw new Error("Fake bookmarks root has no children");
    await browser.bookmarks.create({
      parentId: bar.id,
      title: "A",
      url: "https://x.com",
    });
    await browser.bookmarks.create({
      parentId: bar.id,
      title: "B",
      url: "https://x.com",
    });
  });

  afterEach(() => {
    for (const harness of mountedHarnesses.splice(0)) harness.unmount();
    document.querySelector("h1")?.remove();
    vi.unstubAllGlobals();
  });

  it("ignores Escape while a delete is running and focuses the heading after the rescan", async () => {
    const removal = Promise.withResolvers<null>();
    const remove = vi.fn<() => Promise<void>>(async () => {
      await removal.promise;
    });
    fakeBrowser.bookmarks.remove = remove;
    await openConfirmDialog();

    const confirmButton = [...document.body.querySelectorAll("button")].find(
      (candidate) =>
        candidate.textContent.includes("duplicates_deleteButton") &&
        candidate.closest('[role="alertdialog"]'),
    );
    if (!confirmButton) throw new Error("Delete button not found");
    await act(() => {
      confirmButton.click();
      return Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(remove).toHaveBeenCalled();
    });

    await act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return Promise.resolve();
    });
    expect(document.querySelector('[role="alertdialog"]')).not.toBe(null);

    await act(() => {
      removal.resolve(null);
      return Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(document.querySelector("h1"));
    });
  });
});

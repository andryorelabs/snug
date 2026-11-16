// @vitest-environment jsdom
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

import { createDomHarness } from "@/lib/testing/dom-harness";
import type { DomHarness } from "@/lib/testing/dom-harness";

const mountedHarnesses: DomHarness[] = [];

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

describe("AppRouter", () => {
  beforeEach(() => {
    fakeBrowser.reset();
    fakeBrowser.i18n.getMessage = vi.fn<(key: string) => string>((key) => key);
    fakeBrowser.runtime.getManifest = vi.fn<typeof fakeBrowser.runtime.getManifest>(() => ({
      manifest_version: 3,
      name: "Snug",
      version: "2.0.0",
    }));
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.doMock("./routes/export", () => ({ ExportRoute: () => null }));
    vi.doMock("./routes/import", () => ({ ImportRoute: () => null }));
    Element.prototype.scrollTo = vi.fn<() => void>();
    Element.prototype.scrollIntoView = vi.fn<() => void>();
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: vi.fn<() => void>(),
      removeEventListener: vi.fn<() => void>(),
    }));
  });

  afterEach(() => {
    for (const harness of mountedHarnesses.splice(0)) harness.unmount();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("redirects an unknown hash route to the Export page", async () => {
    globalThis.location.hash = "#/foo";
    const { AppRouter } = await import("./router");
    const harness = createDomHarness();
    mountedHarnesses.push(harness);

    await harness.render(createElement(AppRouter));

    await vi.waitFor(() => {
      expect(globalThis.location.hash).toBe("#/export");
    });
  });

  it("does not move focus to the heading on the first-load redirect", async () => {
    globalThis.location.hash = "#/foo";
    const { AppRouter } = await import("./router");
    const harness = createDomHarness();
    mountedHarnesses.push(harness);

    await harness.render(createElement(AppRouter));

    await vi.waitFor(() => {
      expect(globalThis.location.hash).toBe("#/export");
    });
    expect(document.activeElement).toBe(document.body);
  });

  it("moves focus to the heading after user-driven navigation", async () => {
    globalThis.location.hash = "#/export";
    const { AppRouter } = await import("./router");
    const harness = createDomHarness();
    mountedHarnesses.push(harness);
    await harness.render(createElement(AppRouter));
    await vi.waitFor(() => {
      expect(harness.container.querySelector(':scope nav a[href$="/import"]')).not.toBe(null);
    });

    await act(() => {
      harness.container.querySelector<HTMLAnchorElement>(':scope nav a[href$="/import"]')?.click();
      return Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(document.activeElement).toBe(harness.container.querySelector("h1"));
    });
  });

  it("closes the mobile sheet after picking a page", async () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener: vi.fn<() => void>(),
      removeEventListener: vi.fn<() => void>(),
    }));
    globalThis.location.hash = "#/export";
    const { AppRouter } = await import("./router");
    const harness = createDomHarness();
    mountedHarnesses.push(harness);
    await harness.render(createElement(AppRouter));
    await act(() => {
      document.querySelector<HTMLButtonElement>('[data-sidebar="trigger"]')?.click();
      return Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(document.querySelector('[data-mobile="true"]')).not.toBe(null);
    });

    await act(() => {
      document.querySelector<HTMLAnchorElement>('[data-mobile="true"] a[href$="/import"]')?.click();
      return Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(document.querySelector('[data-mobile="true"]')).toBe(null);
    });
  });

  it("focuses the Safety snapshot card title on a section deep link", async () => {
    globalThis.location.hash = "#/settings?section=safety-snapshot";
    const { AppRouter } = await import("./router");
    const harness = createDomHarness();
    mountedHarnesses.push(harness);

    await harness.render(createElement(AppRouter));

    await vi.waitFor(() => {
      expect(document.activeElement).toBe(
        [...harness.container.querySelectorAll('[tabindex="-1"]')].find(
          (element) => element.textContent === "safetySnapshot_title",
        ),
      );
    });
  });

  it("does not move focus on a plain Settings visit or an invalid section", async () => {
    globalThis.location.hash = "#/settings?section=bogus";
    const { AppRouter } = await import("./router");
    const harness = createDomHarness();
    mountedHarnesses.push(harness);

    await harness.render(createElement(AppRouter));

    await vi.waitFor(() => {
      expect(harness.container.textContent).toContain("safetySnapshot_title");
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(document.activeElement).toBe(document.body);
  });
});

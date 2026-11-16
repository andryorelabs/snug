// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetFakeI18n } from "@/lib/testing/fake-i18n";

class EmptyReader {
  private readonly listeners = new Map<string, () => void>();
  result: string | null = null;
  error: Error | null = null;

  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, listener);
  }

  readAsDataURL(): void {
    queueMicrotask(() => {
      this.listeners.get("loadend")?.();
    });
  }
}

beforeEach(() => {
  resetFakeI18n();
  vi.spyOn(console, "error").mockReturnValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getFaviconBase64 with an unusable reader result", () => {
  it("returns an empty string when the reader yields no data URL", async () => {
    vi.stubGlobal("FileReader", EmptyReader);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => Promise.resolve(new Response(new Blob(["icon"])))),
    );
    vi.resetModules();
    const { getFaviconBase64 } = await import("./favicon");
    await expect(getFaviconBase64("https://example.com")).resolves.toBe("");
  });
});

import { beforeEach, vi } from "vitest";

/**
 * Gives every test file a `browser.permissions` where all optional
 * permissions are granted, because `fakeBrowser` leaves it unimplemented.
 * Tests that need a missing or denied permission overwrite it themselves.
 */
beforeEach(() => {
  Reflect.set(browser, "permissions", {
    contains: vi.fn(() => Promise.resolve(true)),
    request: vi.fn(() => Promise.resolve(true)),
    onAdded: { addListener: vi.fn(), removeListener: vi.fn() },
    onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
  });
});

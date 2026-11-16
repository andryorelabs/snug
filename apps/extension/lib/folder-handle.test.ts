// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeDirectoryHandle } from "@/lib/testing/fake-directory-handle";

import {
  clearFolderHandle,
  loadFolderHandle,
  queryFolderAccess,
  queryStoredFolderAccess,
  saveFolderHandle,
} from "./folder-handle";

interface FakeRequest<T> {
  result?: T;
  onsuccess?: (event: Event) => void;
  onupgradeneeded?: (event: Event) => void;
  addEventListener: () => void;
}

function request<T>(compute: () => T): FakeRequest<T> {
  const fake: FakeRequest<T> = { addEventListener: vi.fn<() => void>() };
  queueMicrotask(() => {
    fake.result = compute();
    fake.onsuccess?.(new Event("success"));
  });
  return fake;
}

/**
 * Minimal `indexedDB` fake: one in-memory map per database name, with the
 * request/transaction surface `folder-handle` uses.
 */
function installFakeIndexedDatabase(): void {
  const databases = new Map<string, Map<string, unknown>>();

  const indexedDatabaseFake = {
    open(name: string) {
      const fake: FakeRequest<unknown> = { addEventListener: vi.fn<() => void>() };
      queueMicrotask(() => {
        const isNew = !databases.has(name);
        const store = databases.get(name) ?? new Map<string, unknown>();
        databases.set(name, store);
        const database = {
          createObjectStore: vi.fn<() => void>(),
          close: vi.fn<() => void>(),
          transaction: () => ({
            objectStore: () => ({
              put: (value: unknown, key: string) =>
                request(() => {
                  store.set(key, value);
                  return key;
                }),
              get: (key: string) => request(() => store.get(key)),
              delete: (key: string) => request(() => store.delete(key)),
            }),
          }),
        };
        fake.result = database;
        if (isNew) fake.onupgradeneeded?.(new Event("upgradeneeded"));
        fake.onsuccess?.(new Event("success"));
      });
      return fake;
    },
  };
  Object.assign(globalThis, { indexedDB: indexedDatabaseFake });
}

beforeEach(() => {
  installFakeIndexedDatabase();
});

describe("folder-handle", () => {
  it("returns null and reports missing access before a handle is saved", async () => {
    expect(await loadFolderHandle()).toBeNull();
    expect(await queryStoredFolderAccess()).toBe("missing");
  });

  it("saves, loads and clears the handle", async () => {
    const handle = new FakeDirectoryHandle("Backups").asHandle();

    await saveFolderHandle(handle);
    expect(await loadFolderHandle()).toBe(handle);

    await clearFolderHandle();
    expect(await loadFolderHandle()).toBeNull();
  });

  it("reports the access the handle gives", async () => {
    const handle = new FakeDirectoryHandle("Backups", "prompt");

    expect(await queryFolderAccess(handle.asHandle())).toBe("prompt");

    await saveFolderHandle(handle.asHandle());
    expect(await queryStoredFolderAccess()).toBe("prompt");
  });
});

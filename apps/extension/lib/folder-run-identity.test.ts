import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isCurrentFolder,
  pruneFolderIdentities,
  registerFolderIdentity,
} from "./folder-run-identity";
import { FakeDirectoryHandle } from "./testing/fake-directory-handle";

const randomUUID = vi.fn<() => string>();

interface FakeRequest<T> {
  result: T;
  error: DOMException | null;
  onsuccess?: () => void;
  onupgradeneeded?: () => void;
  addEventListener: (type: string, listener: () => void) => void;
}

const settle = <T>(compute: () => T): FakeRequest<T> => {
  const listeners: Record<string, () => void> = {};
  const request: FakeRequest<T> = {
    result: undefined as T,
    error: null,
    addEventListener: (type, listener) => {
      listeners[type] = listener;
    },
  };
  queueMicrotask(() => {
    queueMicrotask(() => {
      request.result = compute();
      request.onsuccess?.();
    });
  });
  return request;
};

/**
 * Minimal in-memory IndexedDB: one database with one object store, requests
 * settling on a microtask the way the real API settles asynchronously.
 * @param options Fake database behavior.
 * @param options.failOpen Makes opening the database fail.
 * @returns The stored rows and the fake database.
 */
function installFakeIndexedDatabase(options: { failOpen?: boolean } = {}) {
  const rows = new Map<string, unknown>();
  let isCreated = false;

  const store = {
    getAllKeys: () => settle(() => rows.keys().toArray()),
    getAll: () => settle(() => rows.values().toArray()),
    put: (value: unknown, key: string) =>
      settle(() => {
        rows.set(key, value);
        return key;
      }),
    delete: (key: string) =>
      settle(() => {
        rows.delete(key);
      }),
  };

  const database = {
    transaction: () => ({ objectStore: () => store }),
    createObjectStore: vi.fn(),
    close: vi.fn(),
  };

  vi.stubGlobal("indexedDB", {
    open: () => {
      const listeners: Record<string, () => void> = {};
      const request = {
        result: database,
        error: null as DOMException | null,
        onsuccess: undefined as (() => void) | undefined,
        onupgradeneeded: undefined as (() => void) | undefined,
        addEventListener: (type: string, listener: () => void) => {
          listeners[type] = listener;
        },
      };
      queueMicrotask(() => {
        if (options.failOpen) {
          request.error = new DOMException("blocked", "AbortError");
          listeners["error"]?.();
          return;
        }
        if (!isCreated) {
          isCreated = true;
          request.onupgradeneeded?.();
        }
        request.onsuccess?.();
      });
      return request;
    },
  });

  return { rows, database };
}

beforeEach(() => {
  vi.stubGlobal("crypto", { randomUUID });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("folder identities", () => {
  it("rejects when the database cannot be opened", async () => {
    installFakeIndexedDatabase({ failOpen: true });

    await expect(
      registerFolderIdentity(new FakeDirectoryHandle("a").asHandle()),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("gives a new folder a generated id and reuses it for the same folder", async () => {
    installFakeIndexedDatabase();
    randomUUID.mockReturnValueOnce("id-a");
    const folder = new FakeDirectoryHandle("a").asHandle();

    const first = await registerFolderIdentity(folder);
    const second = await registerFolderIdentity(folder);

    expect(first).toBe("id-a");
    expect(second).toBe("id-a");
  });

  it("gives a different folder a different id", async () => {
    installFakeIndexedDatabase();
    randomUUID.mockReturnValueOnce("id-a").mockReturnValueOnce("id-b");

    const a = await registerFolderIdentity(new FakeDirectoryHandle("a").asHandle());
    const b = await registerFolderIdentity(new FakeDirectoryHandle("b").asHandle());

    expect([a, b]).toEqual(["id-a", "id-b"]);
  });

  it("recognizes the current folder only when the identity is known and matches", async () => {
    installFakeIndexedDatabase();
    randomUUID.mockReturnValueOnce("id-a");
    const folder = new FakeDirectoryHandle("a").asHandle();
    const id = await registerFolderIdentity(folder);

    await expect(isCurrentFolder(id, folder)).resolves.toBe(true);
    await expect(isCurrentFolder(id, new FakeDirectoryHandle("other").asHandle())).resolves.toBe(
      false,
    );
    await expect(isCurrentFolder("unknown", folder)).resolves.toBe(false);
  });

  it("prunes identities the history no longer references", async () => {
    const { rows } = installFakeIndexedDatabase();
    randomUUID.mockReturnValueOnce("keep").mockReturnValueOnce("drop");
    await registerFolderIdentity(new FakeDirectoryHandle("a").asHandle());
    await registerFolderIdentity(new FakeDirectoryHandle("b").asHandle());

    await pruneFolderIdentities(["keep"]);

    expect(rows.keys().toArray()).toEqual(["keep"]);
  });
});

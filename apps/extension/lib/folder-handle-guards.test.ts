import { afterEach, describe, expect, it, vi } from "vitest";

import { FakeDirectoryHandle } from "@/lib/testing/fake-directory-handle";

import { canPickFolder, pickFolder, queryFolderAccess, requestFolderAccess } from "./folder-handle";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("folder access guards", () => {
  it("rejects a query on a handle without the permission API", async () => {
    const handle = new FakeDirectoryHandle("bare").asHandle();
    Object.setPrototypeOf(handle, null);
    await expect(queryFolderAccess(handle)).rejects.toThrow("queryPermission");
  });

  it("rejects a request on a handle without the permission API", async () => {
    const handle = new FakeDirectoryHandle("bare").asHandle();
    await expect(requestFolderAccess(handle)).rejects.toThrow("requestPermission");
  });
});

describe("directory picker", () => {
  it("is unavailable when the browser lacks showDirectoryPicker", async () => {
    vi.stubGlobal("showDirectoryPicker", undefined);
    expect(canPickFolder()).toBe(false);
    await expect(pickFolder()).rejects.toThrow("showDirectoryPicker is not available");
  });

  it("opens the picker in read/write mode when it exists", async () => {
    const chosen = new FakeDirectoryHandle("chosen").asHandle();
    const picker = vi.fn<(options: { mode: "readwrite" }) => Promise<FileSystemDirectoryHandle>>(
      () => Promise.resolve(chosen),
    );
    vi.stubGlobal("showDirectoryPicker", picker);
    expect(canPickFolder()).toBe(true);
    await expect(pickFolder()).resolves.toBe(chosen);
    expect(picker).toHaveBeenCalledWith({ mode: "readwrite" });
  });
});

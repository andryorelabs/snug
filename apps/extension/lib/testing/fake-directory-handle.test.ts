import { describe, expect, it } from "vitest";

import { FakeDirectoryHandle } from "./fake-directory-handle";

describe("FakeDirectoryHandle", () => {
  it("hands itself out as a directory handle", () => {
    const fake = new FakeDirectoryHandle("root");
    expect(fake.asHandle()).toBe(fake);
  });

  it("refuses to pose as a directory handle once its kind changes", () => {
    const fake = new FakeDirectoryHandle("root");
    Object.defineProperty(fake, "kind", { value: "file" });
    expect(() => fake.asHandle()).toThrow("not a directory handle");
  });

  it("reports the permission it was given", async () => {
    await expect(new FakeDirectoryHandle("root", "prompt").queryPermission()).resolves.toBe(
      "prompt",
    );
  });

  it("creates subdirectories only on request and reuses them", async () => {
    const fake = new FakeDirectoryHandle("root");
    await expect(fake.getDirectoryHandle("missing")).rejects.toThrow("not found");
    const created = await fake.getDirectoryHandle("made", { create: true });
    await expect(fake.getDirectoryHandle("made")).resolves.toBe(created);
    await expect(fake.isSameEntry(fake)).resolves.toBe(true);
    await expect(fake.isSameEntry(created)).resolves.toBe(false);
  });

  it("writes, aborts and removes files", async () => {
    const fake = new FakeDirectoryHandle("root");
    await expect(fake.getFileHandle("a.txt")).rejects.toThrow("not found");

    const file = await fake.getFileHandle("a.txt", { create: true });
    const writable = await file.createWritable();
    await writable.write("hello");
    await writable.close();
    expect(fake.files.get("a.txt")).toBe("hello");

    const discarded = await file.createWritable();
    await discarded.write("lost");
    await discarded.abort();
    expect(fake.files.get("a.txt")).toBe("hello");

    await fake.removeEntry("a.txt");
    await expect(fake.removeEntry("a.txt")).rejects.toThrow("not found");
  });
});

import { isRecord } from "@/lib/is-record";

/**
 * Narrows a value read back from IndexedDB, or a test fake, to a directory
 * handle.
 * @param value The value to test.
 * @returns Whether `value` reports itself as a directory handle.
 */
export function isDirectoryHandle(value: unknown): value is FileSystemDirectoryHandle {
  return isRecord(value) && value.kind === "directory";
}

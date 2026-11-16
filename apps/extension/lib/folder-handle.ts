import { isDirectoryHandle } from "@/lib/is-directory-handle";

/**
 * Folder access as the Custom folder's handle reports it, or `missing` when
 * no handle is stored. Anything other than `granted` means a run cannot write
 * without a user gesture.
 */
export type FolderAccess = PermissionState | "missing";

/**
 * `queryPermission` is not part of the DOM typings yet.
 */
interface PermissionAwareDirectoryHandle extends FileSystemDirectoryHandle {
  queryPermission(descriptor: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(descriptor: { mode: "readwrite" }): Promise<PermissionState>;
}

type QueryableDirectoryHandle = FileSystemDirectoryHandle &
  Pick<PermissionAwareDirectoryHandle, "queryPermission">;
type RequestableDirectoryHandle = FileSystemDirectoryHandle &
  Pick<PermissionAwareDirectoryHandle, "requestPermission">;

function canQueryPermission(handle: FileSystemDirectoryHandle): handle is QueryableDirectoryHandle {
  return "queryPermission" in handle;
}

function canRequestPermission(
  handle: FileSystemDirectoryHandle,
): handle is RequestableDirectoryHandle {
  return "requestPermission" in handle;
}

const DATABASE_NAME = "snug-custom-folder";
const STORE_NAME = "handles";
const HANDLE_KEY = "custom-folder";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.addEventListener("error", () => {
      reject(request.error ?? new Error("IndexedDB request failed"));
    });
  });
}

async function runRequest<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = operation(database.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.addEventListener("error", () => {
        reject(request.error ?? new Error("IndexedDB request failed"));
      });
    });
  } finally {
    database.close();
  }
}

/**
 * Stores the Custom folder's directory handle in IndexedDB, replacing any
 * previous one. The handle never leaves the device.
 * @param handle The handle returned by `showDirectoryPicker`.
 * @returns Resolves once the handle is persisted.
 */
export async function saveFolderHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await runRequest("readwrite", (store) => store.put(handle, HANDLE_KEY));
}

/**
 * @returns The stored Custom folder handle, or `null` when none was saved.
 */
export async function loadFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  const stored = await runRequest<unknown>("readonly", (store) => store.get(HANDLE_KEY));
  return isDirectoryHandle(stored) ? stored : null;
}

/**
 * Removes the stored Custom folder handle.
 * @returns Resolves once the handle is gone.
 */
export async function clearFolderHandle(): Promise<void> {
  await runRequest("readwrite", (store) => store.delete(HANDLE_KEY));
}

/**
 * Queries the Folder access of a handle without prompting. A run checks this
 * before it writes, since the browser may drop the grant across restarts.
 * @param handle The Custom folder handle to query.
 * @returns The permission state for read/write access.
 */
export async function queryFolderAccess(
  handle: FileSystemDirectoryHandle,
): Promise<PermissionState> {
  if (!canQueryPermission(handle)) {
    throw new TypeError("This directory handle does not expose queryPermission");
  }
  return handle.queryPermission({
    mode: "readwrite",
  });
}

/**
 * Asks the user to grant Folder access again. Must be called inside a user
 * gesture, or the browser rejects the prompt.
 * @param handle The Custom folder handle to request access for.
 * @returns The permission state after the prompt.
 */
export async function requestFolderAccess(
  handle: FileSystemDirectoryHandle,
): Promise<PermissionState> {
  if (!canRequestPermission(handle)) {
    throw new TypeError("This directory handle does not expose requestPermission");
  }
  return handle.requestPermission({
    mode: "readwrite",
  });
}

/**
 * Loads the stored handle and queries its Folder access in one step.
 * @returns The stored folder's access, or `missing` when no handle is stored.
 */
export async function queryStoredFolderAccess(): Promise<FolderAccess> {
  const handle = await loadFolderHandle();
  return handle ? queryFolderAccess(handle) : "missing";
}

/**
 * `showDirectoryPicker` is not part of the DOM typings yet.
 */
type DirectoryPicker = (options: { mode: "readwrite" }) => Promise<FileSystemDirectoryHandle>;

function getDirectoryPicker(): DirectoryPicker | undefined {
  const candidate: unknown = Reflect.get(globalThis, "showDirectoryPicker");
  return isDirectoryPicker(candidate) ? candidate : undefined;
}

function isDirectoryPicker(value: unknown): value is DirectoryPicker {
  return typeof value === "function";
}

/**
 * @returns Whether this browser exposes `showDirectoryPicker`, so a Custom
 *   folder can be chosen at all.
 */
export function canPickFolder(): boolean {
  return getDirectoryPicker() !== undefined;
}

/**
 * Opens the browser's directory picker for a read/write Custom folder. Must be
 * called inside a user gesture.
 * @returns The chosen directory handle.
 * @throws {DOMException} `AbortError` when the user dismisses the picker.
 */
export async function pickFolder(): Promise<FileSystemDirectoryHandle> {
  const picker = getDirectoryPicker();
  if (!picker) throw new Error("showDirectoryPicker is not available");
  return picker.call(globalThis, { mode: "readwrite" });
}

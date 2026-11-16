import { isDirectoryHandle } from "@/lib/is-directory-handle";

/**
 * In-memory stand-in for the slice of `FileSystemDirectoryHandle` the Custom
 * folder writer uses, so unit tests run without a real file system. Files are
 * kept as text keyed by name; subdirectories are nested fakes.
 */
export class FakeDirectoryHandle {
  readonly kind = "directory";
  readonly files = new Map<string, string>();
  readonly directories = new Map<string, FakeDirectoryHandle>();
  readonly name: string;
  permission: PermissionState;

  constructor(name: string, permission: PermissionState = "granted") {
    this.name = name;
    this.permission = permission;
  }

  queryPermission(): Promise<PermissionState> {
    return Promise.resolve(this.permission);
  }

  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FakeDirectoryHandle> {
    const existing = this.directories.get(name);
    if (existing) return Promise.resolve(existing);
    if (!options?.create) {
      return Promise.reject(new DOMException("not found", "NotFoundError"));
    }
    const created = new FakeDirectoryHandle(name);
    this.directories.set(name, created);
    return Promise.resolve(created);
  }

  isSameEntry(other: unknown): Promise<boolean> {
    return Promise.resolve(other === this);
  }

  removeEntry(name: string): Promise<void> {
    return this.files.delete(name)
      ? Promise.resolve()
      : Promise.reject(new DOMException("not found", "NotFoundError"));
  }

  getFileHandle(name: string, options?: { create?: boolean }) {
    if (!this.files.has(name)) {
      if (!options?.create) {
        return Promise.reject(new DOMException("not found", "NotFoundError"));
      }
      this.files.set(name, "");
    }
    return Promise.resolve({
      kind: "file",
      name,
      createWritable: () => {
        let pending = "";
        return Promise.resolve({
          write: (chunk: string) => {
            pending += chunk;
            return Promise.resolve();
          },
          close: () => {
            this.files.set(name, pending);
            return Promise.resolve();
          },
          abort: () => Promise.resolve(),
        });
      },
    });
  }

  asHandle(): FileSystemDirectoryHandle {
    if (!isDirectoryHandle(this)) throw new TypeError("The fake is not a directory handle");
    return this;
  }
}

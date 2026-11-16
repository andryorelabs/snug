import { describe, expect, it, vi } from "vitest";

import {
  findKeyFiles,
  parseStagedPaths,
  type PreCommitDependencies,
  runPreCommit,
} from "./pre-commit";

function dependencies(
  stagedPaths: string[],
  overrides: Partial<PreCommitDependencies> = {},
): PreCommitDependencies {
  return {
    listStagedPaths: () => stagedPaths,
    log: vi.fn(),
    ...overrides,
  };
}

describe("findKeyFiles", () => {
  it.each([".env.keys", "apps/extension/.env.keys", "production.env.keys"])(
    "flags %s",
    (stagedPath) => {
      expect(findKeyFiles([stagedPath])).toEqual([stagedPath]);
    },
  );

  it.each([".env", ".env.keys.bak", "docs/env.keys.md", "src/keys.ts", ".env.example"])(
    "ignores %s",
    (stagedPath) => {
      expect(findKeyFiles([stagedPath])).toEqual([]);
    },
  );
});

describe("runPreCommit", () => {
  it("refuses the commit when a .env.keys file is staged", () => {
    const log = vi.fn();

    const exitCode = runPreCommit(dependencies(["README.md", "apps/site/.env.keys"], { log }));

    expect(exitCode).toBe(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("apps/site/.env.keys"));
  });

  it("allows a commit that stages no key file", () => {
    expect(runPreCommit(dependencies(["README.md"]))).toBe(0);
  });

  it("allows an empty index", () => {
    expect(runPreCommit(dependencies([]))).toBe(0);
  });
});

describe("parseStagedPaths", () => {
  it("splits on NUL so a non-ASCII key file path stays matchable", () => {
    const paths = parseStagedPaths("README.md\0dé/.env.keys\0");

    expect(paths).toEqual(["README.md", "dé/.env.keys"]);
    expect(findKeyFiles(paths)).toEqual(["dé/.env.keys"]);
  });

  it("returns no paths for an empty index", () => {
    expect(parseStagedPaths("")).toEqual([]);
  });
});

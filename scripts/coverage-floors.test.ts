import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";

import { COVERAGE_EXCEPTIONS } from "./coverage-exceptions.ts";
import {
  checkCoverageFloors,
  coverageThresholds,
  FLOORS,
  findLoweredExceptionFloors,
  findLoweredFloors,
  findStaleFloors,
  main,
  METRICS,
  PER_FILE_MINIMUM,
  parseExceptionFloors,
  readBaseExceptions,
  readBaseFile,
  readBaseFloors,
} from "./coverage-floors.ts";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..");

const floors = (value: number) => ({
  lines: value,
  statements: value,
  branches: value,
  functions: value,
});

const toSummary = (measured: Record<string, number>): Record<string, { pct: number }> =>
  Object.fromEntries(Object.entries(measured).map(([name, pct]) => [name, { pct }]));

const withMeasuredRoot = (measured: Record<string, number>, run: (root: string) => void) => {
  const root = mkdtempSync(path.join(tmpdir(), "coverage-floors-"));
  try {
    mkdirSync(path.join(root, "apps/site/coverage"), { recursive: true });
    const summary = JSON.stringify({ total: toSummary(measured) });
    writeFileSync(path.join(root, "apps/site/coverage/coverage-summary.json"), summary);
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

describe("findLoweredFloors", () => {
  test("passes when every floor is equal or higher", () => {
    expect(findLoweredFloors({ ".": floors(90) }, { ".": { ...floors(90), lines: 95 } })).toEqual(
      [],
    );
  });

  test("fails when a floor is lower than on the base", () => {
    expect(
      findLoweredFloors({ ".": floors(90) }, { ".": { ...floors(90), branches: 89 } }),
    ).toEqual([". branches: 89 < 90"]);
  });

  test("fails when a workspace is removed", () => {
    expect(findLoweredFloors({ a: floors(10) }, {})).toHaveLength(METRICS.length);
  });
});

describe("findLoweredExceptionFloors", () => {
  const base = { ".": { "scripts/a.ts": { lines: 80, functions: 70 } } };

  test("fails when an exception floor is lowered", () => {
    expect(
      findLoweredExceptionFloors(base, {
        ".": { "scripts/a.ts": { lines: 79, functions: 70 } },
      }),
    ).toEqual(["./scripts/a.ts lines: 79 < 80"]);
  });

  test("passes when the floor rises or the exception is retired", () => {
    expect(
      findLoweredExceptionFloors(base, {
        ".": { "scripts/a.ts": { lines: 90, functions: 70 } },
      }),
    ).toEqual([]);
    expect(findLoweredExceptionFloors(base, {})).toEqual([]);
  });
});

describe("findStaleFloors", () => {
  test("fails when a floor trails the measured value by more than the margin", () => {
    expect(findStaleFloors({ ".": floors(80) }, { ".": { lines: 90 } })).toHaveLength(1);
  });

  test("passes within the margin and for unmeasured workspaces", () => {
    expect(findStaleFloors({ ".": floors(80) }, { ".": { lines: 81.5 } })).toEqual([]);
    expect(findStaleFloors({ ".": floors(80) }, {})).toEqual([]);
  });
});

describe("coverageThresholds", () => {
  test("applies the aggregate floors and the per-file minimum", () => {
    const thresholds = coverageThresholds("apps/site");

    expect(thresholds.lines).toBe(FLOORS["apps/site"]?.lines);
    const perFileEntries = Object.entries(thresholds).filter(
      ([, value]) => typeof value === "object" && "perFile" in value,
    );

    expect(perFileEntries).toHaveLength(1);
    expect(perFileEntries[0]?.[1]).toEqual({ perFile: true, ...PER_FILE_MINIMUM });
    const excludedFiles = Object.keys(COVERAGE_EXCEPTIONS["apps/site"] ?? {}).map((file) =>
      file.replaceAll(/[()[\]{}*?!]/g, String.raw`\$&`),
    );
    expect(perFileEntries[0]?.[0]).toBe(`!(${excludedFiles.join("|")})`);
    expect(Object.keys(thresholds)).toEqual(expect.arrayContaining(excludedFiles));
  });

  test("rejects a workspace without floors", () => {
    expect(() => coverageThresholds("apps/unknown")).toThrow(/no entry/);
  });
});

describe("repository coverage configuration", () => {
  test("every workspace floor is a percentage", () => {
    expect(Object.keys(FLOORS).toSorted((left, right) => left.localeCompare(right))).toEqual([
      ".",
      "apps/extension",
      "apps/site",
      "apps/video",
      "packages/ui",
    ]);
    for (const workspaceFloors of Object.values(FLOORS)) {
      for (const metric of METRICS) {
        expect(workspaceFloors[metric]).toBeGreaterThanOrEqual(0);
        expect(workspaceFloors[metric]).toBeLessThanOrEqual(100);
      }
    }
  });

  test("no floor is lower than on develop", () => {
    const base = readBaseFloors(REPOSITORY_ROOT);

    expect(base === null ? [] : findLoweredFloors(base, FLOORS)).toEqual([]);
  });

  test("every exception is real, reasoned and below the per-file minimum", () => {
    const problems: string[] = [];
    for (const [workspace, files] of Object.entries(COVERAGE_EXCEPTIONS)) {
      expect(FLOORS[workspace]).toBeDefined();
      for (const [file, exception] of Object.entries(files)) {
        const isBelowMinimum =
          exception.lines < PER_FILE_MINIMUM.lines ||
          exception.functions < PER_FILE_MINIMUM.functions;
        problems.push(
          ...(existsSync(path.join(REPOSITORY_ROOT, workspace, file)) ? [] : [`${file} missing`]),
          ...(exception.reason.trim() === "" ? [`${file} has no reason`] : []),
          ...(isBelowMinimum ? [] : [`${file} is not below the per-file minimum`]),
        );
      }
    }
    expect(problems).toEqual([]);
  });
});

describe("checkCoverageFloors and main", () => {
  test("reports a floor far below the measured value and exits non-zero", () => {
    withMeasuredRoot({ lines: 100, statements: 100, branches: 100, functions: 100 }, (root) => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(
        checkCoverageFloors(root, null, null).some((line) => line.startsWith("stale: apps/site")),
      ).toBe(true);
      expect(main(root, null, null)).toBe(1);
      expect(error).toHaveBeenCalled();
      error.mockRestore();
    });
  });

  test("reports floors lowered against the base", () => {
    withMeasuredRoot({ ...FLOORS["apps/site"] }, (root) => {
      expect(checkCoverageFloors(root, { ".": floors(100) }, null)[0]).toMatch(
        /^lowered: \. lines:/,
      );
    });
  });

  test("reports an exception floor lowered against the base", () => {
    withMeasuredRoot({ ...FLOORS["apps/site"] }, (root) => {
      const base = { ".": { "scripts/pre-push.ts": { lines: 100, functions: 100 } } };
      expect(checkCoverageFloors(root, null, base)).toEqual([
        "lowered exception: ./scripts/pre-push.ts lines: 86 < 100",
        "lowered exception: ./scripts/pre-push.ts functions: 69 < 100",
      ]);
    });
  });

  test("fails closed when the base branch cannot be read", () => {
    withMeasuredRoot({ ...FLOORS["apps/site"] }, (root) => {
      expect(() => readBaseFloors(root)).toThrow(/cannot read coverage-floors\.json/);
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(main(root)).toBe(1);
      expect(error).toHaveBeenCalledWith(expect.stringContaining("cannot read"));
      error.mockRestore();
    });
  });

  test("reads the exception floors out of the exception list source", () => {
    const parsed = parseExceptionFloors(
      readFileSync(path.join(REPOSITORY_ROOT, "scripts/coverage-exceptions.ts"), "utf8"),
    );
    expect(parsed["."]?.["scripts/pre-push.ts"]).toEqual({ lines: 86, functions: 69 });
    expect(parsed).toEqual(
      Object.fromEntries(
        Object.entries(COVERAGE_EXCEPTIONS).map(([workspace, files]) => [
          workspace,
          Object.fromEntries(
            Object.entries(files).map(([file, { lines, functions }]) => [
              file,
              { lines, functions },
            ]),
          ),
        ]),
      ),
    );
  });

  test("passes when the floors track the measured value", () => {
    withMeasuredRoot({ ...FLOORS["apps/site"] }, (root) => {
      expect(main(root, null, null)).toBe(0);
    });
  });
});

const withRepository = (
  branch: string,
  files: Record<string, string>,
  run: (root: string) => void,
) => {
  const root = mkdtempSync(path.join(tmpdir(), "coverage-floors-git-"));
  const git = (...gitArguments: string[]) =>
    execFileSync("git", gitArguments, { cwd: root, stdio: "ignore" });
  try {
    git("init", "-q", "-b", branch);
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    git("config", "commit.gpgsign", "false");
    for (const [name, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
      writeFileSync(path.join(root, name), content);
      git("add", name);
    }
    git("commit", "-q", "--allow-empty", "-m", "base");
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

describe("readBaseFile", () => {
  test("reads a file that the base branch tracks", () => {
    withRepository("develop", { "coverage-floors.json": '{"a":1}' }, (root) => {
      expect(readBaseFile(root, "coverage-floors.json")).toBe('{"a":1}');
      expect(readBaseFloors(root)).toEqual({ a: 1 });
    });
  });

  test("returns null when the base branch does not track the file yet", () => {
    withRepository("develop", {}, (root) => {
      expect(readBaseFile(root, "coverage-floors.json")).toBeNull();
      expect(readBaseFloors(root)).toBeNull();
      expect(readBaseExceptions(root)).toBeNull();
    });
  });

  test("throws when neither base branch exists", () => {
    withRepository("feature", { "coverage-floors.json": "{}" }, (root) => {
      expect(() => readBaseFile(root, "coverage-floors.json")).toThrow(/cannot read/);
    });
  });

  test("reads the exception floors from the base branch", () => {
    const source = readFileSync(
      path.join(REPOSITORY_ROOT, "scripts/coverage-exceptions.ts"),
      "utf8",
    );
    withRepository("develop", { "scripts/coverage-exceptions.ts": source }, (root) => {
      expect(readBaseExceptions(root)?.["."]?.["scripts/pre-push.ts"]).toEqual({
        lines: 86,
        functions: 69,
      });
    });
  });
});

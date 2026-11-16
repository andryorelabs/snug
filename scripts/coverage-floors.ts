import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import floorsFile from "../coverage-floors.json" with { type: "json" };
import { COVERAGE_EXCEPTIONS, type CoverageException } from "./coverage-exceptions.ts";

export const METRICS = ["lines", "statements", "branches", "functions"] as const;
export type Metric = (typeof METRICS)[number];
export type Floors = Readonly<Record<Metric, number>>;
export type FloorsByWorkspace = Readonly<Record<string, Floors>>;
export type ExceptionsByWorkspace = Readonly<
  Record<string, Readonly<Record<string, Pick<CoverageException, "lines" | "functions">>>>
>;
type Measured = Readonly<Record<string, Partial<Record<Metric, number>>>>;

export const PER_FILE_MINIMUM = { lines: 97, functions: 98 } as const;

/**
 * How far above its floor a measured value may sit before the floor counts as
 * stale.
 */
export const STALE_MARGIN = 2;

export const FLOORS: FloorsByWorkspace = floorsFile;

/**
 * Builds the Vitest `coverage.thresholds` for a workspace: the aggregate floors
 * from `coverage-floors.json`, the per-file minimum for every file outside the
 * exception list, and one own-floor entry per excepted file.
 * @param workspace - Workspace key in `coverage-floors.json`, `.` for the root.
 * @returns The thresholds object to hand to Vitest.
 */
export function coverageThresholds(workspace: string) {
  const floors = FLOORS[workspace];
  if (floors === undefined) {
    throw new Error(`coverage-floors.json has no entry for "${workspace}"`);
  }
  const exceptions = COVERAGE_EXCEPTIONS[workspace] ?? {};
  const excepted = Object.keys(exceptions).map((file) =>
    file.replaceAll(/[()[\]{}*?!]/g, String.raw`\$&`),
  );
  const perFileGlob = excepted.length === 0 ? "**" : `!(${excepted.join("|")})`;
  const exceptionThresholds = Object.fromEntries(
    Object.entries(exceptions).map(([file, { lines, functions }]) => [
      file.replaceAll(/[()[\]{}*?!]/g, String.raw`\$&`),
      { lines, functions },
    ]),
  );
  return {
    ...floors,
    ...exceptionThresholds,
    [perFileGlob]: { perFile: true, ...PER_FILE_MINIMUM },
  };
}

/**
 * Lists every floor that is lower in `current` than in `base`, or missing from
 * it.
 * @param base - Floors on the base branch.
 * @param current - Floors in the working tree.
 * @returns One line per lowered floor.
 */
export function findLoweredFloors(base: FloorsByWorkspace, current: FloorsByWorkspace): string[] {
  return Object.entries(base).flatMap(([workspace, baseFloors]) =>
    METRICS.filter((metric) => (current[workspace]?.[metric] ?? -1) < baseFloors[metric]).map(
      (metric) =>
        `${workspace} ${metric}: ${current[workspace]?.[metric] ?? "missing"} < ${baseFloors[metric]}`,
    ),
  );
}

/**
 * Lists every exception floor that is lower in `current` than in `base`.
 * @param base - Exception floors on the base branch.
 * @param current - Exception floors in the working tree.
 * @returns One line per lowered exception floor.
 */
export function findLoweredExceptionFloors(
  base: ExceptionsByWorkspace,
  current: ExceptionsByWorkspace,
): string[] {
  const metrics = ["lines", "functions"] as const;
  return Object.entries(base).flatMap(([workspace, files]) =>
    Object.entries(files).flatMap(([file, baseFloors]) => {
      const entry = current[workspace]?.[file];
      return metrics
        .filter((metric) => entry !== undefined && entry[metric] < baseFloors[metric])
        .map(
          (metric) => `${workspace}/${file} ${metric}: ${entry?.[metric]} < ${baseFloors[metric]}`,
        );
    }),
  );
}

/**
 * Lists every floor that sits more than `margin` points below the measured
 * value.
 * @param floors - Floors from `coverage-floors.json`.
 * @param measured - Measured totals per workspace.
 * @param margin - Allowed distance between measured value and floor.
 * @returns One line per stale floor.
 */
export function findStaleFloors(
  floors: FloorsByWorkspace,
  measured: Measured,
  margin = STALE_MARGIN,
): string[] {
  return Object.entries(measured).flatMap(([workspace, values]) =>
    METRICS.filter(
      (metric) => (values[metric] ?? 0) - (floors[workspace]?.[metric] ?? Infinity) > margin,
    ).map(
      (metric) =>
        `${workspace} ${metric}: floor ${floors[workspace]?.[metric]} trails measured ${values[metric]}`,
    ),
  );
}

/**
 * Reads `coverage-floors.json` from `develop`.
 * @param repositoryRoot - Repository checkout to read from.
 * @returns The floors on the base branch, or `null` when no base has them yet.
 */
export function readBaseFloors(repositoryRoot: string): FloorsByWorkspace | null {
  for (const reference of ["origin/develop", "develop"]) {
    try {
      const raw = execFileSync("git", ["show", `${reference}:coverage-floors.json`], {
        cwd: repositoryRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      return JSON.parse(raw) as FloorsByWorkspace;
    } catch {
      continue;
    }
  }
  return null;
}

function readMeasured(repositoryRoot: string): Measured {
  const measured: Record<string, Partial<Record<Metric, number>>> = {};
  for (const workspace of Object.keys(FLOORS)) {
    const summaryPath = path.join(repositoryRoot, workspace, "coverage", "coverage-summary.json");
    if (!existsSync(summaryPath)) {
      continue;
    }
    const { total } = JSON.parse(readFileSync(summaryPath, "utf8")) as {
      total: Record<Metric, { pct: number }>;
    };
    measured[workspace] = Object.fromEntries(METRICS.map((metric) => [metric, total[metric].pct]));
  }
  return measured;
}

/**
 * Runs the raise-only and floors-track-measured checks.
 * @param repositoryRoot - Repository checkout holding the coverage summaries.
 * @param base - Floors on the base branch, read from `develop` by default.
 * @returns One line per problem found.
 */
export function checkCoverageFloors(
  repositoryRoot: string,
  base: FloorsByWorkspace | null = readBaseFloors(repositoryRoot),
): string[] {
  const lowered = base === null ? [] : findLoweredFloors(base, FLOORS);
  const stale = findStaleFloors(FLOORS, readMeasured(repositoryRoot));
  return [...lowered.map((line) => `lowered: ${line}`), ...stale.map((line) => `stale: ${line}`)];
}

/**
 * Prints the problems found.
 * @param repositoryRoot - Repository checkout to check.
 * @returns The process exit code.
 */
export function main(repositoryRoot: string): number {
  const problems = checkCoverageFloors(repositoryRoot);
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    return 1;
  }
  return 0;
}

if (import.meta.main) {
  process.exitCode = main(path.resolve(import.meta.dirname, ".."));
}

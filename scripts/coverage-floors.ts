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

const BASE_REFERENCES = ["origin/develop", "develop"] as const;

/**
 * Reads one tracked file from the base branch, failing closed.
 * @param repositoryRoot - Repository checkout to read from.
 * @param relativePath - Repo-relative path of the file.
 * @returns The file text, or `null` when the base branch exists but does not have the file yet.
 * @throws {Error} When no base branch can be resolved or git cannot read it.
 */
export function readBaseFile(repositoryRoot: string, relativePath: string): string | null {
  const git = (gitArguments: string[]) =>
    execFileSync("git", gitArguments, {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  for (const reference of BASE_REFERENCES) {
    try {
      git(["rev-parse", "--verify", "--quiet", reference + "^{commit}"]);
    } catch {
      continue;
    }
    const isTracked = git(["ls-tree", "--name-only", reference, "--", relativePath]).trim() !== "";
    return isTracked ? git(["show", `${reference}:${relativePath}`]) : null;
  }
  throw new Error(
    `cannot read ${relativePath} from ${BASE_REFERENCES.join(" or ")}: fetch develop before running the raise-only check`,
  );
}

/**
 * Reads `coverage-floors.json` from `develop`.
 * @param repositoryRoot - Repository checkout to read from.
 * @returns The floors on the base branch, or `null` when the base has none yet.
 * @throws {Error} When the base branch cannot be read.
 */
export function readBaseFloors(repositoryRoot: string): FloorsByWorkspace | null {
  const raw = readBaseFile(repositoryRoot, "coverage-floors.json");
  return raw === null ? null : (JSON.parse(raw) as FloorsByWorkspace);
}

/**
 * Extracts the own floors of every excepted file from the text of
 * `scripts/coverage-exceptions.ts`.
 * @param source - Source text of the exception list.
 * @returns Exception floors keyed by workspace and file.
 */
export function parseExceptionFloors(source: string): ExceptionsByWorkspace {
  const result: Record<string, Record<string, { lines: number; functions: number }>> = {};
  let files: Record<string, { lines: number; functions: number }> | undefined;
  let entry: { lines: number; functions: number } | undefined;
  for (const line of source.split("\n")) {
    const workspaceMatch = /^ {2}"([^"]+)": \{$/.exec(line);
    const fileMatch = /^ {4}"([^"]+)": \{$/.exec(line);
    const metricMatch = /^ {6}(lines|functions): (\d+),$/.exec(line);
    if (workspaceMatch?.[1] !== undefined) {
      files = {};
      result[workspaceMatch[1]] = files;
      entry = undefined;
    } else if (files !== undefined && fileMatch?.[1] !== undefined) {
      entry = { lines: NaN, functions: NaN };
      files[fileMatch[1]] = entry;
    } else if (metricMatch !== null && entry !== undefined) {
      entry[metricMatch[1] === "lines" ? "lines" : "functions"] = Number(metricMatch[2]);
    }
  }
  return result;
}

/**
 * Reads the exception floors from `develop`.
 * @param repositoryRoot - Repository checkout to read from.
 * @returns The exception floors on the base branch, or `null` when the base has none yet.
 * @throws {Error} When the base branch cannot be read.
 */
export function readBaseExceptions(repositoryRoot: string): ExceptionsByWorkspace | null {
  const raw = readBaseFile(repositoryRoot, "scripts/coverage-exceptions.ts");
  return raw === null ? null : parseExceptionFloors(raw);
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
 * @param baseExceptions - Exception floors on the base branch, read from `develop` by default.
 * @returns One line per problem found.
 */
export function checkCoverageFloors(
  repositoryRoot: string,
  base: FloorsByWorkspace | null = readBaseFloors(repositoryRoot),
  baseExceptions: ExceptionsByWorkspace | null = readBaseExceptions(repositoryRoot),
): string[] {
  const lowered = base === null ? [] : findLoweredFloors(base, FLOORS);
  const loweredExceptions =
    baseExceptions === null ? [] : findLoweredExceptionFloors(baseExceptions, COVERAGE_EXCEPTIONS);
  const stale = findStaleFloors(FLOORS, readMeasured(repositoryRoot));
  return [
    ...lowered.map((line) => `lowered: ${line}`),
    ...loweredExceptions.map((line) => `lowered exception: ${line}`),
    ...stale.map((line) => `stale: ${line}`),
  ];
}

/**
 * Prints the problems found. A base branch that cannot be read is a problem,
 * never a pass.
 * @param repositoryRoot - Repository checkout to check.
 * @param base - Floors on the base branch, read from `develop` by default.
 * @param baseExceptions - Exception floors on the base branch, read from `develop` by default.
 * @returns The process exit code.
 */
export function main(
  repositoryRoot: string,
  base?: FloorsByWorkspace | null,
  baseExceptions?: ExceptionsByWorkspace | null,
): number {
  try {
    const problems = checkCoverageFloors(repositoryRoot, base, baseExceptions);
    if (problems.length > 0) {
      console.error(problems.join("\n"));
      return 1;
    }
    return 0;
  } catch (error) {
    console.error(String(error));
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = main(path.resolve(import.meta.dirname, ".."));
}

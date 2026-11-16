import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

import { isRecord } from "./json-guards";

const DEFAULT_WORKFLOWS_DIRECTORY = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.github/workflows",
);

export interface WorkflowStep {
  readonly id?: string;
  readonly name?: string;
  readonly if?: string;
  readonly "continue-on-error"?: boolean;
  readonly uses?: string;
  readonly run?: string;
  readonly env?: Record<string, unknown>;
  readonly with?: Record<string, unknown>;
}

export interface WorkflowJob {
  readonly if?: string;
  readonly strategy?: { readonly matrix?: Record<string, unknown> };
  readonly "continue-on-error"?: boolean;
  readonly needs?: unknown;
  readonly "timeout-minutes"?: unknown;
  readonly uses?: string;
  readonly permissions?: unknown;
  readonly steps?: readonly WorkflowStep[];
}

export interface Workflow {
  readonly on?: unknown;
  readonly concurrency?: unknown;
  readonly permissions?: unknown;
  readonly jobs?: Record<string, WorkflowJob>;
}

/**
 * Lists the workflow file names under `.github/workflows`.
 * @param directory The workflows directory, defaulting to `.github/workflows`.
 * @returns The sorted workflow file names.
 */
export function listWorkflowFiles(directory: string = DEFAULT_WORKFLOWS_DIRECTORY): string[] {
  return readdirSync(directory)
    .filter((name) => /\.ya?ml$/.test(name))
    .toSorted((first, second) => first.localeCompare(second));
}

/**
 * Reads a workflow file's raw text.
 * @param fileName The file name inside the workflows directory.
 * @param directory The workflows directory, defaulting to `.github/workflows`.
 * @returns The unparsed file content.
 */
export function readWorkflowText(
  fileName: string,
  directory: string = DEFAULT_WORKFLOWS_DIRECTORY,
): string {
  return readFileSync(path.join(directory, fileName), "utf8");
}

function isWorkflow(value: unknown): value is Workflow {
  return isRecord(value);
}

/**
 * Parses workflow YAML text.
 * @param text The workflow YAML source.
 * @returns The workflow document as a plain object.
 * @throws {TypeError} When the document is not a YAML mapping.
 */
export function parseWorkflow(text: string): Workflow {
  const document: unknown = parse(text);
  if (!isWorkflow(document)) {
    throw new TypeError("workflow document must be a YAML mapping");
  }
  return document;
}

/**
 * Reads and parses a workflow file.
 * @param fileName The file name inside the workflows directory.
 * @param directory The workflows directory, defaulting to `.github/workflows`.
 * @returns The workflow document as a plain object.
 */
export function readWorkflow(
  fileName: string,
  directory: string = DEFAULT_WORKFLOWS_DIRECTORY,
): Workflow {
  return parseWorkflow(readWorkflowText(fileName, directory));
}

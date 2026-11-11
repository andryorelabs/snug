import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  evaluateZipSize,
  findChromeZip,
  runZipSizeCheck,
  ZIP_SIZE_BUDGET_BYTES,
} from "./check-zip-size";

describe("evaluateZipSize", () => {
  it("passes at or under the budget", () => {
    expect(evaluateZipSize("a-chrome.zip", 100, 100).isWithinBudget).toBe(true);
    expect(evaluateZipSize("a-chrome.zip", 99, 100).isWithinBudget).toBe(true);
  });

  it("fails over the budget and says so in the summary line", () => {
    const verdict = evaluateZipSize("a-chrome.zip", 101, 100);
    expect(verdict.isWithinBudget).toBe(false);
    expect(verdict.summaryLine).toContain("OVER");
  });

  it("keeps the budget at the documented size plus 10%", () => {
    expect(ZIP_SIZE_BUDGET_BYTES).toBe(Math.ceil(641_826 * 1.1));
  });
});

describe("findChromeZip", () => {
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "zip-size-"));
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it("finds the chrome zip and ignores the edge one", () => {
    writeFileSync(path.join(directory, "snug-1-edge.zip"), "");
    writeFileSync(path.join(directory, "snug-1-chrome.zip"), "");
    expect(findChromeZip(directory)).toBe(path.join(directory, "snug-1-chrome.zip"));
  });

  it("returns undefined when missing", () => {
    expect(findChromeZip(directory)).toBeUndefined();
    expect(findChromeZip(path.join(directory, "nope"))).toBeUndefined();
  });
});

describe("runZipSizeCheck", () => {
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "zip-size-run-"));
    vi.spyOn(console, "log").mockImplementation(vi.fn());
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(directory, { recursive: true, force: true });
  });

  it("exits 0 and says so when no zip was built", () => {
    expect(runZipSizeCheck([directory], {})).toBe(0);
    expect(console.log).toHaveBeenCalledWith(
      "No extension zip built (extension not affected by this change).",
    );
  });

  it("exits 0 and appends the verdict to the step summary when within budget", () => {
    writeFileSync(path.join(directory, "snug-1-chrome.zip"), "tiny");
    const summaryPath = path.join(directory, "summary.md");

    expect(runZipSizeCheck([directory], { GITHUB_STEP_SUMMARY: summaryPath })).toBe(0);
    expect(readFileSync(summaryPath, "utf8")).toContain("(within)");
  });

  it("exits 1 when the zip is over budget", () => {
    writeFileSync(
      path.join(directory, "snug-1-chrome.zip"),
      Buffer.alloc(ZIP_SIZE_BUDGET_BYTES + 1),
    );

    expect(runZipSizeCheck([directory], {})).toBe(1);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("OVER"));
  });
});

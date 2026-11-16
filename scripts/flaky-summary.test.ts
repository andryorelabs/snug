import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  findFlakyTests,
  type PlaywrightReport,
  renderSummary,
  runFlakySummary,
} from "./flaky-summary";

const REPORT: PlaywrightReport = {
  suites: [
    {
      specs: [
        {
          title: "opens the popup",
          file: "popup.spec.ts",
          tests: [{ results: [{ status: "failed" }, { status: "passed" }] }],
        },
        {
          title: "saves a session",
          file: "popup.spec.ts",
          tests: [{ results: [{ status: "passed" }] }],
        },
      ],
      suites: [
        {
          specs: [
            {
              title: "renders the hero",
              file: "home.spec.ts",
              tests: [{ results: [{ status: "timedOut" }, { status: "passed" }] }],
            },
            {
              title: "fails every retry",
              file: "home.spec.ts",
              tests: [{ results: [{ status: "failed" }, { status: "failed" }] }],
            },
          ],
        },
      ],
    },
  ],
};

describe("findFlakyTests", () => {
  test("lists only tests that failed and then passed on a retry, in nested suites too", () => {
    expect(findFlakyTests(REPORT)).toEqual([
      "popup.spec.ts: opens the popup",
      "home.spec.ts: renders the hero",
    ]);
  });

  test("finds nothing in an empty report", () => {
    expect(findFlakyTests({})).toEqual([]);
  });
});

describe("renderSummary", () => {
  test("names each flaky test under a heading with the report label", () => {
    expect(renderSummary("Extension E2E", ["a.spec.ts: one"])).toBe(
      "### Flaky tests: Extension E2E\n\n- a.spec.ts: one\n",
    );
  });

  test("says none when every test passed first time", () => {
    expect(renderSummary("Site E2E", [])).toBe("### Flaky tests: Site E2E\n\nNone.\n");
  });
});

describe("runFlakySummary", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "flaky-summary-"));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  test("appends the summary of each report to the step summary file", () => {
    const reportPath = path.join(directory, "test-results", "report.json");
    mkdirSync(path.dirname(reportPath));
    writeFileSync(reportPath, JSON.stringify(REPORT));
    const summaryPath = path.join(directory, "summary.md");
    writeFileSync(summaryPath, "existing\n");

    const code = runFlakySummary([`Extension E2E=${reportPath}`], {
      summaryPath,
      log: () => void 0,
    });

    expect(code).toBe(0);
    expect(readFileSync(summaryPath, "utf8")).toBe(
      "existing\n### Flaky tests: Extension E2E\n\n- popup.spec.ts: opens the popup\n- home.spec.ts: renders the hero\n",
    );
  });

  test("notes a missing report instead of failing, so a skipped suite never breaks CI", () => {
    const summaryPath = path.join(directory, "summary.md");

    const code = runFlakySummary([`Site E2E=${path.join(directory, "missing.json")}`], {
      summaryPath,
      log: () => void 0,
    });

    expect(code).toBe(0);
    expect(readFileSync(summaryPath, "utf8")).toBe(
      "### Flaky tests: Site E2E\n\nNo report: the suite did not run.\n",
    );
  });

  test("prints the summary when there is no step summary file", () => {
    const lines: string[] = [];

    runFlakySummary([`Site E2E=${path.join(directory, "missing.json")}`], {
      summaryPath: undefined,
      log: (text) => {
        lines.push(text);
      },
    });

    expect(lines).toEqual(["### Flaky tests: Site E2E\n\nNo report: the suite did not run.\n"]);
  });

  test("exits 1 with the usage line for an argument without a label", () => {
    const lines: string[] = [];

    expect(
      runFlakySummary(["report.json"], {
        summaryPath: undefined,
        log: (text) => {
          lines.push(text);
        },
      }),
    ).toBe(1);
    expect(lines).toEqual(["Usage: bun scripts/flaky-summary.ts <label>=<report.json>..."]);
  });
});

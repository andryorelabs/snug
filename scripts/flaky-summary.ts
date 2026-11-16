import { appendFileSync, existsSync, readFileSync } from "node:fs";

const USAGE = "Usage: bun scripts/flaky-summary.ts <label>=<report.json>...";

interface ReportResult {
  readonly status: string;
}

interface ReportTest {
  readonly results: readonly ReportResult[];
}

interface ReportSpec {
  readonly title: string;
  readonly file: string;
  readonly tests: readonly ReportTest[];
}

interface ReportSuite {
  readonly specs?: readonly ReportSpec[];
  readonly suites?: readonly ReportSuite[];
}

/**
 * The slice of Playwright's JSON report this script reads.
 */
export interface PlaywrightReport {
  readonly suites?: readonly ReportSuite[];
}

function collectSpecs(suite: ReportSuite): ReportSpec[] {
  return [...(suite.specs ?? []), ...(suite.suites ?? []).flatMap((child) => collectSpecs(child))];
}

function isFlaky({ results }: ReportTest): boolean {
  return (
    results.length > 1 &&
    results.at(-1)?.status === "passed" &&
    results.some(({ status }) => status !== "passed")
  );
}

/**
 * Lists the tests that failed at least once and then passed on a retry
 * (rule E20).
 * @param report A parsed Playwright JSON report.
 * @returns `file: title` for each flaky test, in report order.
 */
export function findFlakyTests(report: PlaywrightReport): string[] {
  return (report.suites ?? [])
    .flatMap((suite) => collectSpecs(suite))
    .filter((spec) => spec.tests.some((test) => isFlaky(test)))
    .map((spec) => `${spec.file}: ${spec.title}`);
}

/**
 * Renders the Markdown section shown in the job summary.
 * @param label The suite the report belongs to, such as `Extension E2E`.
 * @param flaky The flaky test names.
 * @returns A short Markdown section.
 */
export function renderSummary(label: string, flaky: readonly string[]): string {
  const body = flaky.length === 0 ? "None." : flaky.map((name) => `- ${name}`).join("\n");
  return `### Flaky tests: ${label}\n\n${body}\n`;
}

/**
 * Where {@link runFlakySummary} writes: the `GITHUB_STEP_SUMMARY` file, or
 * the console when that file is unset.
 */
export interface FlakySummaryOutput {
  readonly summaryPath: string | undefined;
  readonly log: (text: string) => void;
}

function summarizeReport(label: string, reportPath: string): string {
  if (!existsSync(reportPath)) {
    return `### Flaky tests: ${label}\n\nNo report: the suite did not run.\n`;
  }
  const report = JSON.parse(readFileSync(reportPath, "utf8")) as PlaywrightReport;
  return renderSummary(label, findFlakyTests(report));
}

/**
 * Runs `bun scripts/flaky-summary.ts <label>=<report.json>...`: one summary
 * section per Playwright JSON report. A missing report is noted, not an
 * error, because a suite skipped on an unaffected pull request writes none.
 * @param commandArguments The arguments after the script name.
 * @param output The step summary file and the console.
 * @returns The process exit code: 0 once written, 1 on a malformed argument.
 */
export function runFlakySummary(
  commandArguments: readonly string[],
  output: FlakySummaryOutput,
): number {
  const reports = commandArguments.map((argument) => /^([^=]+)=(.+)$/.exec(argument));
  if (reports.length === 0 || reports.includes(null)) {
    output.log(USAGE);
    return 1;
  }
  const summary = reports
    .map((match) => summarizeReport(match?.[1] ?? "", match?.[2] ?? ""))
    .join("");
  if (output.summaryPath === undefined) output.log(summary);
  else appendFileSync(output.summaryPath, summary);
  return 0;
}

if (import.meta.main) {
  process.exitCode = runFlakySummary(process.argv.slice(2), {
    summaryPath: process.env["GITHUB_STEP_SUMMARY"],
    log: (text) => console.log(text),
  });
}

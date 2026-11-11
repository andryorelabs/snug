import { describe, expect, it, vi } from "vitest";

import { readWorkflow } from "../workflow-files";
import { releaseNotes, runReleaseNotes } from "./release-notes";

function output() {
  return {
    notes: vi.fn<(text: string) => void>(),
    error: vi.fn<(message: string) => void>(),
  };
}

function needsList(needs: unknown): unknown[] {
  return Array.isArray(needs) ? needs : [needs];
}

const CHANGELOG = `# Changelog

## [Unreleased]

## [2.4.0] - 2026-11-11

### Added

- A new thing.

## [2.3.1] - 2026-11-03

### Fixed

## [2.3.0] - 2026-11-03

- Older.

[Unreleased]: https://example.test/compare/v2.4.0...HEAD
`;

describe("releaseNotes", () => {
  it("returns the section body for the tag", () => {
    expect(releaseNotes("v2.4.0", CHANGELOG)).toBe("### Added\n\n- A new thing.");
  });

  it("fails when the tag has no section", () => {
    expect(() => releaseNotes("v2.5.0", CHANGELOG)).toThrow(
      'CHANGELOG.md has no "## [2.5.0]" section for the tag v2.5.0',
    );
  });

  it("fails when the section is empty", () => {
    expect(() => releaseNotes("v2.3.1", CHANGELOG)).toThrow(
      'The "## [2.3.1]" section of CHANGELOG.md is empty',
    );
  });

  it("never falls back to the Unreleased section", () => {
    expect(() => releaseNotes("vUnreleased", CHANGELOG)).toThrow(/is empty/);
  });
});

describe("runReleaseNotes", () => {
  it("writes the notes and exits 0", () => {
    const streams = output();

    expect(runReleaseNotes(["v2.3.0"], () => CHANGELOG, streams)).toBe(0);
    expect(streams.notes).toHaveBeenCalledWith("- Older.");
    expect(streams.error).not.toHaveBeenCalled();
  });

  it("exits 1 naming the missing section and writes no notes", () => {
    const streams = output();

    expect(runReleaseNotes(["v9.9.9"], () => CHANGELOG, streams)).toBe(1);
    expect(streams.notes).not.toHaveBeenCalled();
    expect(streams.error).toHaveBeenCalledWith(
      'release-notes: CHANGELOG.md has no "## [9.9.9]" section for the tag v9.9.9',
    );
  });

  it("exits 1 on an empty section", () => {
    expect(runReleaseNotes(["v2.3.1"], () => CHANGELOG, output())).toBe(1);
  });

  it.each([[[]], [["v2.4.0", "extra"]]])(
    "exits 1 with usage for arguments %j",
    (commandArguments) => {
      const streams = output();

      expect(runReleaseNotes(commandArguments, () => CHANGELOG, streams)).toBe(1);
      expect(streams.error).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
    },
  );

  it("lets an unexpected failure surface", () => {
    const failure = new Error("disk gone");

    expect(() =>
      runReleaseNotes(
        ["v2.4.0"],
        () => {
          throw failure;
        },
        output(),
      ),
    ).toThrow(failure);
  });
});

describe("release.yml CHANGELOG gate", () => {
  const workflow = readWorkflow("release.yml");
  const jobs = workflow.jobs ?? {};
  const releaseSteps = jobs.release?.steps ?? [];
  const gateIndex = releaseSteps.findIndex((step) =>
    (step.run ?? "").includes('bun scripts/release/release-notes.ts "${GITHUB_REF_NAME}"'),
  );
  const publishingSteps = releaseSteps.filter(
    (step) =>
      /attest|upload-artifact/.test(step.uses ?? "") ||
      /gh release create|wxt submit|bun run zip/.test(step.run ?? ""),
  );

  it("has a step that runs the release notes script on the tag", () => {
    expect(gateIndex).toBeGreaterThanOrEqual(0);
  });

  it("does not let the gate step continue on error or run conditionally", () => {
    const gate = releaseSteps[gateIndex];

    expect(gate?.["continue-on-error"]).toBeUndefined();
    expect(gate?.if).toBeUndefined();
  });

  it("runs the gate before the build, the attestation, the GitHub Release and the uploads", () => {
    expect(publishingSteps.length).toBeGreaterThanOrEqual(5);
    for (const step of publishingSteps) {
      expect(releaseSteps.indexOf(step)).toBeGreaterThan(gateIndex);
    }
  });

  it("keeps every publishing step outside the release job behind the release job", () => {
    const publishingJobs = Object.entries(jobs).filter(
      ([name, job]) =>
        name !== "release" &&
        (job.steps ?? []).some(
          (step) =>
            /attest|upload-artifact/.test(step.uses ?? "") ||
            /gh release (create|upload)|wxt submit/.test(step.run ?? ""),
        ),
    );

    expect(publishingJobs.map(([name]) => name)).toEqual([
      "publish-chrome-web-store",
      "publish-edge-add-ons",
    ]);
    for (const [, job] of publishingJobs) {
      expect(needsList(job.needs)).toContain("release");
      expect(job.if ?? "").not.toMatch(/always\(\)|failure\(\)/);
    }
  });
});

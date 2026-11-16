import { describe, expect, it, vi } from "vitest";

import { type CommitMessageDependencies, runCommitMessage } from "./commit-msg";

function dependencies(
  overrides: Partial<CommitMessageDependencies> = {},
): CommitMessageDependencies {
  return { runCommitlint: () => 0, log: vi.fn<(message: string) => void>(), ...overrides };
}

describe("runCommitMessage", () => {
  it("lints the message file git passed", () => {
    const runCommitlint = vi.fn<(messageFile: string) => number>(() => 0);

    expect(runCommitMessage(".git/COMMIT_EDITMSG", dependencies({ runCommitlint }))).toBe(0);
    expect(runCommitlint).toHaveBeenCalledWith(".git/COMMIT_EDITMSG");
  });

  it("returns the commitlint exit code when the message is rejected", () => {
    expect(runCommitMessage("msg", dependencies({ runCommitlint: () => 1 }))).toBe(1);
  });

  it.each([undefined, ""])("refuses when git passed no file (%s)", (messageFile) => {
    const runCommitlint = vi.fn<(messageFile: string) => number>(() => 0);
    const log = vi.fn<(message: string) => void>();

    expect(runCommitMessage(messageFile, dependencies({ runCommitlint, log }))).toBe(1);
    expect(runCommitlint).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
  });
});

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, test } from "vitest";

import { findReleaseGateProblems, runReleaseGates } from "./release-gates";

const CHANGELOG = `# Changelog

## [Unreleased]

## [2.4.0] - 2026-11-11

### Added

- A new thing.

## [2.3.1] - 2026-11-03
`;

const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: "Release Tester",
  GIT_AUTHOR_EMAIL: "release@example.test",
  GIT_COMMITTER_NAME: "Release Tester",
  GIT_COMMITTER_EMAIL: "release@example.test",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
};

interface Fixture {
  readonly workspace: string;
  readonly repository: string;
  readonly allowedSigners: string;
}

function run(command: string, commandArguments: readonly string[], cwd: string): string {
  const result = spawnSync(command, commandArguments, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...GIT_IDENTITY },
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArguments.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}

/**
 * Builds a repository at version 2.4.0 with an SSH signing key, its allowed
 * signers file, and one tag per gate: signed (v2.4.0, v2.5.0, v2.3.1),
 * annotated but unsigned, and lightweight.
 * @returns The fixture paths.
 */
function createFixture(): Fixture {
  const workspace = mkdtempSync(path.join(tmpdir(), "release-gates-"));
  const repository = path.join(workspace, "repository");
  const git = (...commandArguments: string[]) => run("git", commandArguments, repository);
  mkdirSync(path.join(repository, "apps/extension"), { recursive: true });
  writeFileSync(
    path.join(repository, "apps/extension/package.json"),
    JSON.stringify({ name: "snug", version: "2.4.0" }),
  );
  writeFileSync(path.join(repository, "CHANGELOG.md"), CHANGELOG);
  git("init", "--quiet");
  git("add", ".");
  git("commit", "--quiet", "--no-gpg-sign", "-m", "release 2.4.0");

  const signingKey = path.join(workspace, "signing-key");
  run("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", "tester", "-f", signingKey], workspace);
  const publicKey = readFileSync(`${signingKey}.pub`, "utf8").trim();
  const allowedSigners = path.join(workspace, "allowed_signers");
  writeFileSync(allowedSigners, `* ${publicKey}\n`);

  for (const name of ["v2.4.0", "v2.5.0", "v2.3.1"]) {
    git(
      "-c",
      "gpg.format=ssh",
      "-c",
      `user.signingkey=${signingKey}`,
      "tag",
      "-s",
      "-m",
      name,
      name,
    );
  }
  git("tag", "-a", "-m", "unsigned", "v2.4.0-unsigned");
  git("tag", "v2.4.0-lightweight");
  return { workspace, repository, allowedSigners };
}

const fixture = createFixture();

function check(tag: string, signers: string | undefined = fixture.allowedSigners): string[] {
  return findReleaseGateProblems({
    tag,
    repositoryRoot: fixture.repository,
    allowedSignersFile: signers,
    environment: GIT_IDENTITY,
  });
}

function runCli(commandArguments: readonly string[]): { code: number; errors: string[] } {
  const errors: string[] = [];
  const code = runReleaseGates(commandArguments, {
    repositoryRoot: fixture.repository,
    environment: GIT_IDENTITY,
    log: () => {},
    error: (message) => {
      errors.push(message);
    },
  });
  return { code, errors };
}

afterAll(() => {
  rmSync(fixture.workspace, { recursive: true, force: true });
});

describe("findReleaseGateProblems", () => {
  test("passes a signed, annotated tag that matches the manifest and has a CHANGELOG section", () => {
    expect(check("v2.4.0")).toEqual([]);
  });

  test("rejects a lightweight tag", () => {
    expect(check("v2.4.0-lightweight")).toContain(
      "tag v2.4.0-lightweight is a lightweight tag; a release tag is annotated and signed (git tag -s)",
    );
  });

  test("rejects an annotated tag without a signature", () => {
    expect(check("v2.4.0-unsigned")).toContain(
      "tag v2.4.0-unsigned has no valid signature (git tag -v failed)",
    );
  });

  test("rejects a signed tag whose key is not an allowed signer", () => {
    const strangers = path.join(fixture.workspace, "no_signers");
    writeFileSync(strangers, "");

    expect(check("v2.4.0", strangers)).toEqual([
      "tag v2.4.0 has no valid signature (git tag -v failed)",
    ]);
  });

  test("rejects a tag that differs from the extension manifest version", () => {
    expect(check("v2.5.0")).toContain(
      "tag v2.5.0 does not match apps/extension/package.json version 2.4.0",
    );
  });

  test("rejects a tag without a CHANGELOG section", () => {
    expect(check("v2.5.0")).toContain(
      'CHANGELOG.md has no "## [2.5.0]" section for the tag v2.5.0',
    );
  });

  test("rejects a tag whose CHANGELOG section is empty", () => {
    expect(check("v2.3.1")).toContain('The "## [2.3.1]" section of CHANGELOG.md is empty');
  });

  test("rejects a tag that does not exist", () => {
    expect(check("v9.9.9")).toContain("tag v9.9.9 does not exist");
  });
});

describe("runReleaseGates", () => {
  test("exits 0 when every gate passes", () => {
    expect(runCli(["v2.4.0", "--allowed-signers", fixture.allowedSigners])).toEqual({
      code: 0,
      errors: [],
    });
  });

  test("exits 1 and names each failed gate", () => {
    const { code, errors } = runCli([
      "v2.4.0-lightweight",
      "--allowed-signers",
      fixture.allowedSigners,
    ]);

    expect(code).toBe(1);
    expect(errors).toContain(
      "release-gates: tag v2.4.0-lightweight is a lightweight tag; a release tag is annotated and signed (git tag -s)",
    );
  });

  const malformedArguments: readonly (readonly string[])[] = [
    [],
    ["v2.4.0", "extra"],
    ["v2.4.0", "--allowed-signers"],
  ];

  test.each(malformedArguments.map((commandArguments) => [commandArguments]))(
    "exits 1 with the usage line for %j",
    (commandArguments: readonly string[]) => {
      expect(runCli(commandArguments)).toEqual({
        code: 1,
        errors: ["Usage: bun scripts/release-gates.ts <tag> [--allowed-signers <file>]"],
      });
    },
  );
});

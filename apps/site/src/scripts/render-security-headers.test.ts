import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SCRIPT_HASHES_PLACEHOLDER } from "./security-headers";

const hashOf = (body: string) => `'sha256-${createHash("sha256").update(body).digest("base64")}'`;

const page = (body: string, allowed: readonly string[]) =>
  `<html><head><meta http-equiv="content-security-policy" content="default-src 'self'; script-src 'self' ${allowed.join(" ")}"></head><body><script>${body}</script></body></html>`;

const state = { scratch: "", originalArguments: [] as string[] };

const runScript = async (arguments_: readonly string[]) => {
  process.argv = [...state.originalArguments.slice(0, 2), ...arguments_];
  vi.resetModules();
  await import("./render-security-headers");
};

beforeEach(() => {
  state.scratch = mkdtempSync(path.join(tmpdir(), "render-headers-"));
  state.originalArguments = [...process.argv];
  vi.spyOn(console, "log").mockImplementation(vi.fn());
});

afterEach(() => {
  process.argv = state.originalArguments;
  vi.restoreAllMocks();
  rmSync(state.scratch, { recursive: true, force: true });
});

describe("render-security-headers", () => {
  it("writes the template with the sorted hashes of every built page", async () => {
    const distribution = path.join(state.scratch, "dist");
    mkdirSync(path.join(distribution, "es"), { recursive: true });
    writeFileSync(
      path.join(distribution, "index.html"),
      page("a()", [hashOf("a()"), hashOf("b()")]),
    );
    writeFileSync(
      path.join(distribution, "es", "index.html"),
      page("b()", [hashOf("a()"), hashOf("b()")]),
    );
    const template = path.join(state.scratch, "template.conf");
    const output = path.join(state.scratch, "out.conf");
    writeFileSync(template, `script-src ${SCRIPT_HASHES_PLACEHOLDER};`);

    await runScript([distribution, template, output]);

    const expected = [hashOf("a()"), hashOf("b()")]
      .toSorted((first, second) => first.localeCompare(second))
      .join(" ");
    expect(readFileSync(output, "utf8")).toBe(`script-src ${expected};`);
    expect(console.log).toHaveBeenCalledWith("CSP: 2 script hashes from 2 pages");
  });

  it("fails and lists an inline script the CSP does not allow", async () => {
    const distribution = path.join(state.scratch, "dist");
    mkdirSync(distribution);
    writeFileSync(path.join(distribution, "index.html"), page("evil()", [hashOf("other()")]));
    const template = path.join(state.scratch, "template.conf");
    writeFileSync(template, SCRIPT_HASHES_PLACEHOLDER);

    await expect(
      runScript([distribution, template, path.join(state.scratch, "out.conf")]),
    ).rejects.toThrow(/Inline scripts missing from the CSP:\nindex\.html 'sha256-/);
  });

  it("fails with a usage message when arguments are missing", async () => {
    await expect(runScript([state.scratch])).rejects.toThrow(
      "Usage: render-security-headers <dist> <template> <output>",
    );
  });
});

import { existsSync, readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

interface HookEntry {
  matcher?: string;
  hooks?: { type?: string; command?: string }[];
}

const REPO_ROOT = new URL("../", import.meta.url);

const settings = JSON.parse(readFileSync(new URL(".claude/settings.json", REPO_ROOT), "utf8")) as {
  permissions?: { deny?: string[] };
  hooks?: { PreToolUse?: HookEntry[] };
};

const denied = settings.permissions?.deny ?? [];

describe(".claude/settings.json", () => {
  test.each([
    "Bash(git push origin main:*)",
    "Bash(git push origin HEAD:main:*)",
    "Bash(git push origin HEAD:refs/heads/main:*)",
    "Bash(git push origin develop:*)",
    "Bash(git push origin HEAD:develop:*)",
    "Bash(git push origin HEAD:refs/heads/develop:*)",
  ])("denies the trunk push %s", (rule) => {
    expect(denied).toContain(rule);
  });

  test("denies the tracker deletes", () => {
    const trackerDeletes = denied.filter((rule) => rule.startsWith("mcp__linear-server__delete_"));
    expect(trackerDeletes).toEqual([
      "mcp__linear-server__delete_comment",
      "mcp__linear-server__delete_attachment",
      "mcp__linear-server__delete_status_update",
    ]);
  });

  test("runs the rm guard before every Bash call", () => {
    const commands = (settings.hooks?.PreToolUse ?? [])
      .filter((entry) => entry.matcher === "Bash")
      .flatMap((entry) => entry.hooks ?? [])
      .map((hook) => hook.command ?? "");
    expect(commands).toEqual(['bun "$CLAUDE_PROJECT_DIR/.claude/hooks/rm-guard.ts"']);
    expect(existsSync(new URL(".claude/hooks/rm-guard.ts", REPO_ROOT))).toBe(true);
  });
});

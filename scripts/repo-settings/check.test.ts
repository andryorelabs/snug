import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  collectLiveSettings,
  diffSettings,
  formatDifference,
  parseSettings,
  readExpectedSettings,
  runCheck,
  type ApiResponse,
  type ExpectedSettings,
  type LiveSettings,
} from "./check";

const FIXTURES_DIRECTORY = path.join(import.meta.dirname, "fixtures");
const REPOSITORY = "andryorelabs/snug";

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURES_DIRECTORY, name), "utf8"));
}

const RECORDED_RESPONSES: Readonly<Record<string, string>> = {
  [`repos/${REPOSITORY}`]: "repository.json",
  [`repos/${REPOSITORY}/private-vulnerability-reporting`]: "private-vulnerability-reporting.json",
  [`repos/${REPOSITORY}/rulesets`]: "rulesets.json",
  [`repos/${REPOSITORY}/rulesets/24223181`]: "ruleset-main.json",
  [`repos/${REPOSITORY}/rulesets/24223182`]: "ruleset-tags.json",
  [`repos/${REPOSITORY}/rulesets/24223183`]: "ruleset-develop.json",
};

/**
 * Answers `gh api` requests from the recorded fixtures. Any endpoint without a
 * fixture answers 404, as the vulnerability-alerts endpoint did when recorded.
 * @param endpoint The API path requested.
 * @returns The recorded response.
 */
function requestRecorded(endpoint: string): ApiResponse {
  const fixture = RECORDED_RESPONSES[endpoint];
  return fixture === undefined ? { found: false } : { found: true, body: readFixture(fixture) };
}

const expected: ExpectedSettings = {
  settings: { allow_squash_merge: true, "security.scanning.status": "enabled" },
  rulesets: {
    "main.json": {
      name: "main",
      enforcement: "active",
      conditions: { ref_name: { include: ["~DEFAULT_BRANCH"] } },
      rules: [
        { type: "deletion" },
        {
          type: "required_status_checks",
          parameters: {
            required_status_checks: [{ context: "CI passed", integration_id: 15_368 }],
          },
        },
      ],
      bypass_actors: [],
    },
  },
};

function buildLive(overrides: {
  repository?: unknown;
  ruleset?: Record<string, unknown>;
}): LiveSettings {
  return {
    repository: overrides.repository ?? {
      allow_squash_merge: true,
      security: { scanning: { status: "enabled" } },
    },
    rulesets: [
      {
        id: 1,
        name: "main",
        enforcement: "active",
        conditions: { ref_name: { exclude: [], include: ["~DEFAULT_BRANCH"] } },
        rules: [
          {
            type: "required_status_checks",
            parameters: {
              strict_required_status_checks_policy: true,
              required_status_checks: [{ context: "CI passed", integration_id: 15_368 }],
            },
          },
          { type: "deletion" },
        ],
        bypass_actors: [],
        ...overrides.ruleset,
      },
    ],
  };
}

describe("diffSettings", () => {
  test("reports nothing when live holds every expected value", () => {
    expect(diffSettings(buildLive({}), expected)).toEqual([]);
  });

  test("names a setting that differs and one that is absent", () => {
    const live = buildLive({ repository: { allow_squash_merge: false } });

    expect(diffSettings(live, expected)).toEqual([
      { path: "settings allow_squash_merge", expected: true, actual: false },
      {
        path: "settings security.scanning.status",
        expected: "enabled",
        actual: undefined,
      },
    ]);
  });

  test("names a missing rule, an unexpected rule and a changed check", () => {
    const live = buildLive({
      ruleset: {
        rules: [
          { type: "creation" },
          {
            type: "required_status_checks",
            parameters: {
              required_status_checks: [
                { context: "CI passed", integration_id: 99 },
                { context: "Extra check", integration_id: 15_368 },
              ],
            },
          },
        ],
      },
    });

    expect(diffSettings(live, expected).map((difference) => formatDifference(difference))).toEqual([
      'rulesets/main.json rules.deletion: expected {"type":"deletion"}, live has nothing',
      "rulesets/main.json rules.required_status_checks.parameters.required_status_checks.CI passed.integration_id: expected 15368, live has 99",
      'rulesets/main.json rules.required_status_checks.parameters.required_status_checks.Extra check: expected nothing, live has {"context":"Extra check","integration_id":15368}',
      'rulesets/main.json rules.creation: expected nothing, live has {"type":"creation"}',
    ]);
  });

  test("names a bypass actor the files do not allow", () => {
    const actor = { actor_id: 5, actor_type: "RepositoryRole" };
    const live = buildLive({ ruleset: { bypass_actors: [actor] } });

    expect(diffSettings(live, expected)).toEqual([
      {
        path: "rulesets/main.json bypass_actors.0",
        expected: undefined,
        actual: actor,
      },
    ]);
  });

  test("names a ruleset missing live and a live ruleset without a file", () => {
    const live = buildLive({ ruleset: { name: "legacy" } });

    expect(diffSettings(live, expected).map(({ path }) => path)).toEqual([
      "rulesets/main.json",
      "rulesets/legacy (live only)",
    ]);
  });
});

describe("parseSettings", () => {
  test("reads the settings and the minimum counts", () => {
    const text = JSON.stringify({
      settings: { allow_squash_merge: true, squash_merge_commit_title: "PR_TITLE" },
      minimumCounts: { topics: 5 },
    });

    expect(parseSettings(text)).toEqual({
      settings: { allow_squash_merge: true, squash_merge_commit_title: "PR_TITLE" },
      minimumCounts: { topics: 5 },
    });
  });

  test("refuses a document without settings", () => {
    expect(() => parseSettings("{}")).toThrow("no expected settings found");
  });
});

describe("each metadata and security setting", () => {
  const committed = readExpectedSettings();
  const matching = {
    description: committed.settings["description"],
    homepage: committed.settings["homepage"],
    topics: ["a", "b", "c", "d", "e"],
    default_branch: "main",
    workflow_permissions: { default_workflow_permissions: "read" },
    fork_pr_contributor_approval: { approval_policy: "all_external_contributors" },
    code_scanning_default_setup: { state: "not-configured" },
    private_vulnerability_reporting: { enabled: true },
    vulnerability_alerts: { enabled: true },
    security_and_analysis: { dependabot_security_updates: { status: "enabled" } },
  };
  const subset: ExpectedSettings = {
    settings: Object.fromEntries(
      Object.entries(committed.settings).filter(
        ([key]) =>
          Object.keys(matching).includes(key.split(".", 1)[0] ?? "") &&
          (!key.startsWith("security_and_analysis") || key.includes("dependabot")),
      ),
    ),
    minimumCounts: committed.minimumCounts ?? {},
    rulesets: {},
  };

  function differences(overrides: Record<string, unknown>): string[] {
    return diffSettings({ repository: { ...matching, ...overrides }, rulesets: [] }, subset).map(
      ({ path: differencePath }) => differencePath,
    );
  }

  test("a repository matching all of them has no difference", () => {
    expect(differences({})).toEqual([]);
  });

  test.each([
    ["description", { description: "Something else" }],
    ["homepage", { homepage: "https://example.com/" }],
    ["default_branch", { default_branch: "develop" }],
    [
      "workflow_permissions.default_workflow_permissions",
      { workflow_permissions: { default_workflow_permissions: "write" } },
    ],
    [
      "fork_pr_contributor_approval.approval_policy",
      { fork_pr_contributor_approval: { approval_policy: "first_time_contributors" } },
    ],
    ["code_scanning_default_setup.state", { code_scanning_default_setup: { state: "configured" } }],
    ["private_vulnerability_reporting.enabled", { private_vulnerability_reporting: {} }],
    ["vulnerability_alerts.enabled", { vulnerability_alerts: { enabled: false } }],
    [
      "security_and_analysis.dependabot_security_updates.status",
      { security_and_analysis: { dependabot_security_updates: { status: "disabled" } } },
    ],
  ])("%s is reported when it differs", (key, override) => {
    expect(differences(override)).toEqual([`settings ${key}`]);
  });

  test("fewer than five topics are reported", () => {
    expect(differences({ topics: ["a", "b", "c", "d"] })).toEqual(["settings topics (count)"]);
  });

  test("the committed description is the brand copy one-line description", () => {
    const copy = readFileSync(path.join(import.meta.dirname, "../../docs/brand/copy.md"), "utf8");
    const row = copy.split("\n").find((line) => line.startsWith("| One-line description"));

    expect(row?.split("|", 3)[2]?.trim()).toBe(committed.settings["description"]);
  });

  test("the committed minimum is five topics", () => {
    expect(committed.minimumCounts).toEqual({ topics: 5 });
  });
});

describe("recorded live output against the committed files", () => {
  const live = collectLiveSettings(REPOSITORY, requestRecorded);
  const committed = readExpectedSettings();

  test("the committed files carry the settings table and all three rulesets", () => {
    expect(Object.keys(committed.rulesets)).toEqual(["develop.json", "main.json", "tags.json"]);
    expect(committed.settings).toMatchObject({
      allow_squash_merge: true,
      allow_merge_commit: true,
      merge_commit_title: "PR_TITLE",
      merge_commit_message: "PR_BODY",
      allow_rebase_merge: false,
      squash_merge_commit_title: "PR_TITLE",
      squash_merge_commit_message: "PR_BODY",
      delete_branch_on_merge: true,
      allow_auto_merge: true,
      allow_update_branch: true,
      has_wiki: false,
      has_projects: false,
      has_discussions: false,
      "security_and_analysis.secret_scanning.status": "enabled",
      "security_and_analysis.secret_scanning_push_protection.status": "enabled",
      "security_and_analysis.dependabot_security_updates.status": "enabled",
      "vulnerability_alerts.enabled": true,
      "private_vulnerability_reporting.enabled": true,
      default_branch: "main",
      "workflow_permissions.default_workflow_permissions": "read",
      "fork_pr_contributor_approval.approval_policy": "all_external_contributors",
      "code_scanning_default_setup.state": "not-configured",
    });
  });

  test("the recorded rulesets match the ruleset files", () => {
    const rulesetDifferences = diffSettings(live, committed).filter(({ path: differencePath }) =>
      differencePath.startsWith("rulesets/"),
    );

    expect(rulesetDifferences).toEqual([]);
  });

  test("the settings that differed when recorded are each named", () => {
    expect(diffSettings(live, committed).map(({ path: differencePath }) => differencePath)).toEqual(
      [
        "settings description",
        "settings allow_merge_commit",
        "settings squash_merge_commit_message",
        "settings merge_commit_title",
        "settings merge_commit_message",
        "settings security_and_analysis.secret_scanning.status",
        "settings security_and_analysis.secret_scanning_push_protection.status",
        "settings security_and_analysis.dependabot_security_updates.status",
        "settings vulnerability_alerts.enabled",
        "settings workflow_permissions.default_workflow_permissions",
        "settings fork_pr_contributor_approval.approval_policy",
        "settings code_scanning_default_setup.state",
      ],
    );
  });
});

describe("runCheck", () => {
  test("exits non-zero and reports each difference", () => {
    const lines: string[] = [];

    const exitCode = runCheck({
      repository: REPOSITORY,
      request: requestRecorded,
      report: (line) => {
        lines.push(line);
      },
    });

    expect(exitCode).toBe(1);
    expect(lines).toContain(
      'settings squash_merge_commit_message: expected "PR_BODY", live has "COMMIT_MESSAGES"',
    );
    expect(lines).toContain("settings vulnerability_alerts.enabled: expected true, live has false");
  });

  test("exits zero when live matches the expectation", () => {
    const lines: string[] = [];

    const exitCode = runCheck({
      repository: REPOSITORY,
      request: requestRecorded,
      report: (line) => {
        lines.push(line);
      },
      expected: {
        settings: { has_wiki: false },
        rulesets: readExpectedSettings().rulesets,
      },
    });

    expect(exitCode).toBe(0);
    expect(lines).toEqual([
      "andryorelabs/snug matches .github/repo-settings.json and .github/rulesets.",
    ]);
  });

  test("fails when the repository itself cannot be read", () => {
    expect(() => collectLiveSettings(REPOSITORY, () => ({ found: false }))).toThrow(
      "repos/andryorelabs/snug answered 404",
    );
  });
});

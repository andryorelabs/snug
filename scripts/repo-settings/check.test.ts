import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

import {
  collectLiveSettings,
  diffSettings,
  formatDifference,
  parseSettingsTable,
  readExpectedSettings,
  runCheck,
  type ApiResponse,
  type ExpectedSettings,
  type LiveSettings,
} from './check'

const FIXTURES_DIRECTORY = path.join(import.meta.dirname, 'fixtures')
const REPOSITORY = 'andryorelabs/snug'

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURES_DIRECTORY, name), 'utf8'))
}

const RECORDED_RESPONSES: Readonly<Record<string, string>> = {
  [`repos/${REPOSITORY}`]: 'repository.json',
  [`repos/${REPOSITORY}/private-vulnerability-reporting`]:
    'private-vulnerability-reporting.json',
  [`repos/${REPOSITORY}/rulesets`]: 'rulesets.json',
  [`repos/${REPOSITORY}/rulesets/24223181`]: 'ruleset-main.json',
  [`repos/${REPOSITORY}/rulesets/24223182`]: 'ruleset-tags.json',
}

/**
 * Answers `gh api` requests from the recorded fixtures. Any endpoint without a
 * fixture answers 404, as the vulnerability-alerts endpoint did when recorded.
 * @param endpoint The API path requested.
 * @returns The recorded response.
 */
function requestRecorded(endpoint: string): ApiResponse {
  const fixture = RECORDED_RESPONSES[endpoint]
  return fixture === undefined
    ? { found: false }
    : { found: true, body: readFixture(fixture) }
}

const expected: ExpectedSettings = {
  settings: { allow_squash_merge: true, 'security.scanning.status': 'enabled' },
  rulesets: {
    'main.json': {
      name: 'main',
      enforcement: 'active',
      conditions: { ref_name: { include: ['~DEFAULT_BRANCH'] } },
      rules: [
        { type: 'deletion' },
        {
          type: 'required_status_checks',
          parameters: {
            required_status_checks: [
              { context: 'CI passed', integration_id: 15_368 },
            ],
          },
        },
      ],
      bypass_actors: [],
    },
  },
}

function buildLive(overrides: {
  repository?: unknown
  ruleset?: Record<string, unknown>
}): LiveSettings {
  return {
    repository: overrides.repository ?? {
      allow_squash_merge: true,
      security: { scanning: { status: 'enabled' } },
    },
    rulesets: [
      {
        id: 1,
        name: 'main',
        enforcement: 'active',
        conditions: { ref_name: { exclude: [], include: ['~DEFAULT_BRANCH'] } },
        rules: [
          {
            type: 'required_status_checks',
            parameters: {
              strict_required_status_checks_policy: true,
              required_status_checks: [
                { context: 'CI passed', integration_id: 15_368 },
              ],
            },
          },
          { type: 'deletion' },
        ],
        bypass_actors: [],
        ...overrides.ruleset,
      },
    ],
  }
}

describe('diffSettings', () => {
  test('reports nothing when live holds every expected value', () => {
    expect(diffSettings(buildLive({}), expected)).toEqual([])
  })

  test('names a setting that differs and one that is absent', () => {
    const live = buildLive({ repository: { allow_squash_merge: false } })

    expect(diffSettings(live, expected)).toEqual([
      { path: 'settings allow_squash_merge', expected: true, actual: false },
      {
        path: 'settings security.scanning.status',
        expected: 'enabled',
        actual: undefined,
      },
    ])
  })

  test('names a missing rule, an unexpected rule and a changed check', () => {
    const live = buildLive({
      ruleset: {
        rules: [
          { type: 'creation' },
          {
            type: 'required_status_checks',
            parameters: {
              required_status_checks: [
                { context: 'CI passed', integration_id: 99 },
                { context: 'Extra check', integration_id: 15_368 },
              ],
            },
          },
        ],
      },
    })

    expect(
      diffSettings(live, expected).map((difference) =>
        formatDifference(difference),
      ),
    ).toEqual([
      'rulesets/main.json rules.deletion: expected {"type":"deletion"}, live has nothing',
      'rulesets/main.json rules.required_status_checks.parameters.required_status_checks.CI passed.integration_id: expected 15368, live has 99',
      'rulesets/main.json rules.required_status_checks.parameters.required_status_checks.Extra check: expected nothing, live has {"context":"Extra check","integration_id":15368}',
      'rulesets/main.json rules.creation: expected nothing, live has {"type":"creation"}',
    ])
  })

  test('names a bypass actor the files do not allow', () => {
    const actor = { actor_id: 5, actor_type: 'RepositoryRole' }
    const live = buildLive({ ruleset: { bypass_actors: [actor] } })

    expect(diffSettings(live, expected)).toEqual([
      {
        path: 'rulesets/main.json bypass_actors.0',
        expected: undefined,
        actual: actor,
      },
    ])
  })

  test('names a ruleset missing live and a live ruleset without a file', () => {
    const live = buildLive({ ruleset: { name: 'legacy' } })

    expect(diffSettings(live, expected).map(({ path }) => path)).toEqual([
      'rulesets/main.json',
      'rulesets/legacy (live only)',
    ])
  })
})

describe('parseSettingsTable', () => {
  test('reads each backticked setting row with its JSON value', () => {
    const markdown = [
      '| Setting | Expected | Meaning |',
      '| ------- | -------- | ------- |',
      '| `allow_squash_merge` | `true` | Squash merges allowed |',
      '| `squash_merge_commit_title` | `"PR_TITLE"` | Title from the PR |',
      '| Not a setting | `true` | Ignored |',
    ].join('\n')

    expect(parseSettingsTable(markdown)).toEqual({
      allow_squash_merge: true,
      squash_merge_commit_title: 'PR_TITLE',
    })
  })

  test('refuses a document without setting rows', () => {
    expect(() => parseSettingsTable('# Rulesets')).toThrow(
      'no expected settings found',
    )
  })
})

describe('recorded live output against the committed files', () => {
  const live = collectLiveSettings(REPOSITORY, requestRecorded)
  const committed = readExpectedSettings()

  test('the committed files carry the settings table and both rulesets', () => {
    expect(Object.keys(committed.rulesets)).toEqual(['main.json', 'tags.json'])
    expect(committed.settings).toMatchObject({
      allow_squash_merge: true,
      allow_merge_commit: false,
      allow_rebase_merge: false,
      squash_merge_commit_title: 'PR_TITLE',
      squash_merge_commit_message: 'PR_BODY',
      delete_branch_on_merge: true,
      allow_auto_merge: true,
      allow_update_branch: true,
      has_wiki: false,
      has_projects: false,
      has_discussions: false,
      'security_and_analysis.secret_scanning.status': 'enabled',
      'security_and_analysis.secret_scanning_push_protection.status': 'enabled',
      'security_and_analysis.dependabot_security_updates.status': 'enabled',
      'vulnerability_alerts.enabled': true,
      'private_vulnerability_reporting.enabled': true,
    })
  })

  test('the recorded rulesets match the ruleset files', () => {
    const rulesetDifferences = diffSettings(live, committed).filter(
      ({ path: differencePath }) => differencePath.startsWith('rulesets/'),
    )

    expect(rulesetDifferences).toEqual([])
  })

  test('the settings that differed when recorded are each named', () => {
    expect(
      diffSettings(live, committed).map(
        ({ path: differencePath }) => differencePath,
      ),
    ).toEqual([
      'settings squash_merge_commit_message',
      'settings security_and_analysis.secret_scanning.status',
      'settings security_and_analysis.secret_scanning_push_protection.status',
      'settings security_and_analysis.dependabot_security_updates.status',
      'settings vulnerability_alerts.enabled',
    ])
  })
})

describe('runCheck', () => {
  test('exits non-zero and reports each difference', () => {
    const lines: string[] = []

    const exitCode = runCheck({
      repository: REPOSITORY,
      request: requestRecorded,
      report: (line) => {
        lines.push(line)
      },
    })

    expect(exitCode).toBe(1)
    expect(lines).toContain(
      'settings squash_merge_commit_message: expected "PR_BODY", live has "COMMIT_MESSAGES"',
    )
    expect(lines).toContain(
      'settings vulnerability_alerts.enabled: expected true, live has false',
    )
  })

  test('exits zero when live matches the expectation', () => {
    const lines: string[] = []

    const exitCode = runCheck({
      repository: REPOSITORY,
      request: requestRecorded,
      report: (line) => {
        lines.push(line)
      },
      expected: {
        settings: { has_wiki: false },
        rulesets: readExpectedSettings().rulesets,
      },
    })

    expect(exitCode).toBe(0)
    expect(lines).toEqual([
      'andryorelabs/snug matches .github/rulesets and the settings table.',
    ])
  })

  test('fails when the repository itself cannot be read', () => {
    expect(() =>
      collectLiveSettings(REPOSITORY, () => ({ found: false })),
    ).toThrow('repos/andryorelabs/snug answered 404')
  })
})

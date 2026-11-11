import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const DEFAULT_REPOSITORY = 'andryorelabs/snug'
const DEFAULT_RULESETS_DIRECTORY = path.resolve(
  import.meta.dirname,
  '../../.github/rulesets',
)
const SETTINGS_TABLE_FILE = 'README.md'
const SETTING_ROW_PATTERN = /^\|\s*`([\w.]+)`\s*\|\s*`([^`]+)`\s*\|/gm

type JsonRecord = Record<string, unknown>

/**
 * One value that differs between the live repository and the committed files.
 * `expected` or `actual` is `undefined` when that side has nothing at `path`.
 */
export interface Difference {
  readonly path: string
  readonly expected: unknown
  readonly actual: unknown
}

/**
 * The live state: the repository object from `gh api repos/<owner>/<repo>`
 * (extended with `vulnerability_alerts` and `private_vulnerability_reporting`)
 * and each ruleset in full.
 */
export interface LiveSettings {
  readonly repository: unknown
  readonly rulesets: readonly unknown[]
}

/**
 * The committed state: the settings table keyed by dotted path into the live
 * repository object, and the ruleset files keyed by file name.
 */
export interface ExpectedSettings {
  readonly settings: Readonly<Record<string, unknown>>
  readonly rulesets: Readonly<Record<string, unknown>>
}

/**
 * The answer to one read-only API request: the parsed body, or a 404.
 */
export type ApiResponse =
  | { readonly found: true; readonly body: unknown }
  | { readonly found: false }

export type ApiRequest = (endpoint: string) => ApiResponse

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function identifyListEntry(entry: unknown, index: number): string {
  if (!isRecord(entry)) return String(entry)
  const name = entry['type'] ?? entry['context']
  return typeof name === 'string' ? name : String(index)
}

function indexList(entries: readonly unknown[]): Map<string, unknown> {
  return new Map(
    entries.map((entry, index) => [identifyListEntry(entry, index), entry]),
  )
}

function compareLists(
  location: string,
  expected: readonly unknown[],
  actual: unknown,
): Difference[] {
  if (!Array.isArray(actual)) return [{ path: location, expected, actual }]
  const expectedEntries = indexList(expected)
  const actualEntries = indexList(actual)
  const changed = [...expectedEntries].flatMap(([key, entry]) =>
    compareValues(`${location}.${key}`, entry, actualEntries.get(key)),
  )
  const unexpected = [...actualEntries]
    .filter(([key]) => !expectedEntries.has(key))
    .map(([key, entry]) => ({
      path: `${location}.${key}`,
      expected: undefined,
      actual: entry,
    }))
  return [...changed, ...unexpected]
}

/**
 * Compares one expected value with its live counterpart. Records compare key by
 * key and ignore live-only keys, since the API adds read-only fields. Lists
 * match entries by `type`, `context` or value, and report live-only entries.
 * @param location The path of the value, used in each difference.
 * @param expected The committed value.
 * @param actual The live value.
 * @returns The differences found at or below `location`.
 */
function compareValues(
  location: string,
  expected: unknown,
  actual: unknown,
): Difference[] {
  if (Array.isArray(expected)) return compareLists(location, expected, actual)
  if (isRecord(expected)) {
    return isRecord(actual)
      ? Object.entries(expected).flatMap(([key, value]) =>
          compareValues(`${location}.${key}`, value, actual[key]),
        )
      : [{ path: location, expected, actual }]
  }
  return Object.is(expected, actual)
    ? []
    : [{ path: location, expected, actual }]
}

function readPath(value: unknown, dottedPath: string): unknown {
  let current = value
  for (const key of dottedPath.split('.')) {
    current = isRecord(current) ? current[key] : undefined
  }
  return current
}

function rulesetName(ruleset: unknown): string | undefined {
  const name = isRecord(ruleset) ? ruleset['name'] : undefined
  return typeof name === 'string' ? name : undefined
}

function diffRulesets(
  live: readonly unknown[],
  expected: Readonly<Record<string, unknown>>,
): Difference[] {
  const expectedNames = new Set(
    Object.values(expected).map((ruleset) => rulesetName(ruleset)),
  )
  const changed = Object.entries(expected).flatMap(([file, ruleset]) => {
    const location = `rulesets/${file}`
    const actual = live.find(
      (candidate) => rulesetName(candidate) === rulesetName(ruleset),
    )
    return actual === undefined || !isRecord(ruleset)
      ? { path: location, expected: ruleset, actual }
      : Object.entries(ruleset).flatMap(([key, value]) =>
          compareValues(`${location} ${key}`, value, readPath(actual, key)),
        )
  })
  const liveOnly = live
    .filter((ruleset) => !expectedNames.has(rulesetName(ruleset)))
    .map((ruleset) => ({
      path: `rulesets/${rulesetName(ruleset) ?? 'unnamed'} (live only)`,
      expected: undefined,
      actual: ruleset,
    }))
  return [...changed, ...liveOnly]
}

/**
 * Compares the live repository against the committed settings and rulesets.
 * @param live The settings and rulesets read from the GitHub API.
 * @param expected The settings table and the ruleset files.
 * @returns One difference per value that is not as committed, settings first.
 */
export function diffSettings(
  live: LiveSettings,
  expected: ExpectedSettings,
): Difference[] {
  const settings = Object.entries(expected.settings).flatMap(([key, value]) =>
    compareValues(`settings ${key}`, value, readPath(live.repository, key)),
  )
  return [...settings, ...diffRulesets(live.rulesets, expected.rulesets)]
}

function describeValue(value: unknown): string {
  return value === undefined ? 'nothing' : JSON.stringify(value)
}

/**
 * Renders one difference as a report line.
 * @param difference The difference to render.
 * @returns The path with the expected and live values.
 */
export function formatDifference(difference: Difference): string {
  return `${difference.path}: expected ${describeValue(difference.expected)}, live has ${describeValue(difference.actual)}`
}

/**
 * Reads the expected-settings table: each row whose first cell is a backticked
 * dotted path and whose second cell is a backticked JSON value.
 * @param markdown The content of `.github/rulesets/README.md`.
 * @returns The expected value of each setting, keyed by its dotted path.
 */
export function parseSettingsTable(markdown: string): Record<string, unknown> {
  const rows = markdown.matchAll(SETTING_ROW_PATTERN).toArray()
  if (rows.length === 0) throw new Error('no expected settings found')
  return Object.fromEntries(
    rows.map((row): [string, unknown] => [
      row[1] ?? '',
      JSON.parse(row[2] ?? 'null'),
    ]),
  )
}

/**
 * Reads the committed expectation: the settings table and every ruleset file.
 * @param directory The rulesets directory, defaulting to `.github/rulesets`.
 * @returns The expected settings and rulesets.
 */
export function readExpectedSettings(
  directory: string = DEFAULT_RULESETS_DIRECTORY,
): ExpectedSettings {
  const readText = (file: string) =>
    readFileSync(path.join(directory, file), 'utf8')
  const rulesetFiles = readdirSync(directory)
    .filter((file) => file.endsWith('.json'))
    .toSorted((first, second) => first.localeCompare(second))
  return {
    settings: parseSettingsTable(readText(SETTINGS_TABLE_FILE)),
    rulesets: Object.fromEntries(
      rulesetFiles.map((file): [string, unknown] => [
        file,
        JSON.parse(readText(file)),
      ]),
    ),
  }
}

function requireBody(request: ApiRequest, endpoint: string): unknown {
  const response = request(endpoint)
  if (!response.found) throw new Error(`${endpoint} answered 404`)
  return response.body
}

/**
 * Reads the live settings and rulesets of a repository. Dependabot alerts have
 * no field on the repository object: their endpoint answers 204 when on and 404
 * when off, recorded here as `vulnerability_alerts.enabled`.
 * @param repository The repository as `<owner>/<repo>`.
 * @param request Performs one read-only API request.
 * @returns The live settings and rulesets.
 */
export function collectLiveSettings(
  repository: string,
  request: ApiRequest,
): LiveSettings {
  const base = `repos/${repository}`
  const repositoryBody = requireBody(request, base)
  const reporting = request(`${base}/private-vulnerability-reporting`)
  const summaries = requireBody(request, `${base}/rulesets`)
  const rulesetIds = (Array.isArray(summaries) ? summaries : []).map(
    (summary: unknown) => (isRecord(summary) ? summary['id'] : undefined),
  )
  return {
    repository: {
      ...(isRecord(repositoryBody) && repositoryBody),
      vulnerability_alerts: {
        enabled: request(`${base}/vulnerability-alerts`).found,
      },
      private_vulnerability_reporting: reporting.found ? reporting.body : {},
    },
    rulesets: rulesetIds.map((id) =>
      requireBody(request, `${base}/rulesets/${String(id)}`),
    ),
  }
}

function isNotFoundError(error: unknown): boolean {
  const stderr = isRecord(error) ? error['stderr'] : undefined
  return typeof stderr === 'string' && stderr.includes('HTTP 404')
}

/**
 * Sends one GET request through `gh api`. It never passes a method flag, so it
 * cannot change a setting.
 * @param endpoint The API path to read.
 * @returns The parsed body, or a not-found answer on HTTP 404.
 */
function requestWithGitHubCli(endpoint: string): ApiResponse {
  try {
    const output = execFileSync('gh', ['api', endpoint], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return {
      found: true,
      body: output.trim() === '' ? {} : JSON.parse(output),
    }
  } catch (error) {
    if (isNotFoundError(error)) return { found: false }
    throw error
  }
}

export interface CheckOptions {
  readonly repository: string
  readonly request: ApiRequest
  readonly report: (line: string) => void
  readonly expected?: ExpectedSettings
}

/**
 * Diffs a live repository against the committed files and reports the result.
 * @param options The repository, the API reader, the reporter and, optionally,
 *   an expectation replacing the committed files.
 * @returns Exit code 0 when live matches, 1 when any value differs.
 */
export function runCheck(options: CheckOptions): number {
  const live = collectLiveSettings(options.repository, options.request)
  const differences = diffSettings(
    live,
    options.expected ?? readExpectedSettings(),
  )
  if (differences.length === 0) {
    options.report(
      `${options.repository} matches .github/rulesets and the settings table.`,
    )
    return 0
  }
  for (const difference of differences) {
    options.report(formatDifference(difference))
  }
  return 1
}

if (import.meta.main) {
  process.exitCode = runCheck({
    repository: process.argv[2] ?? DEFAULT_REPOSITORY,
    request: requestWithGitHubCli,
    report: (line) => console.log(line),
  })
}

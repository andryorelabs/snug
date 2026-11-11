import JSON5 from 'json5'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { parse } from 'yaml'

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '..')
const ISSUE_FORMS_DIRECTORY = path.join(
  REPOSITORY_ROOT,
  '.github/ISSUE_TEMPLATE',
)
const LABEL_KEYS = new Set(['labels', 'addLabels'])
const HEX_COLOR_PATTERN = /^[\da-f]{6}$/

interface LabelReference {
  readonly source: string
  readonly label: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readRepositoryFile(relativePath: string): string {
  return readFileSync(path.join(REPOSITORY_ROOT, relativePath), 'utf8')
}

/**
 * Collects every label named under a `labels` or `addLabels` key, at any depth.
 * @param source The file the value was read from, kept on each reference.
 * @param value A parsed configuration value.
 * @returns One reference per label name found.
 */
function collectLabelReferences(
  source: string,
  value: unknown,
): LabelReference[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectLabelReferences(source, entry))
  }
  if (!isRecord(value)) return []
  return Object.entries(value).flatMap(([key, entry]) =>
    LABEL_KEYS.has(key) && Array.isArray(entry)
      ? entry
          .filter((label) => typeof label === 'string')
          .map((label) => ({ source, label }))
      : collectLabelReferences(source, entry),
  )
}

/**
 * Finds the label references that name no declared label.
 * @param references The labels referenced by forms and configuration.
 * @param declaredNames The label names declared in `.github/labels.yml`.
 * @returns One line per reference to an undeclared label.
 */
function findMissingLabels(
  references: readonly LabelReference[],
  declaredNames: ReadonlySet<string>,
): string[] {
  return references
    .filter(({ label }) => !declaredNames.has(label))
    .map(
      ({ source, label }) =>
        `${source} references label "${label}" missing from .github/labels.yml`,
    )
}

const declaredLabels = asArray(parse(readRepositoryFile('.github/labels.yml')))
const declaredNames = new Set(
  declaredLabels
    .map((label) => (isRecord(label) ? label['name'] : undefined))
    .filter((name) => typeof name === 'string'),
)

const issueFormFiles = readdirSync(ISSUE_FORMS_DIRECTORY).filter(
  (file) => file !== 'config.yml',
)
const issueFormReferences = issueFormFiles.flatMap((file) => {
  const relativePath = `.github/ISSUE_TEMPLATE/${file}`
  return collectLabelReferences(
    relativePath,
    parse(readRepositoryFile(relativePath)),
  )
})
const renovateReferences = collectLabelReferences(
  'renovate.json5',
  JSON5.parse(readRepositoryFile('renovate.json5')),
)

describe('.github/labels.yml', () => {
  test('every label has a name, a six-digit hex color and a description', () => {
    const problems = declaredLabels.flatMap((label, index) => {
      if (!isRecord(label)) return `entry ${index + 1} is not a mapping`
      const entryProblems: string[] = []
      if (typeof label['name'] !== 'string' || label['name'] === '') {
        entryProblems.push(`entry ${index + 1} has no name`)
      }
      if (
        typeof label['color'] !== 'string' ||
        !HEX_COLOR_PATTERN.test(label['color'])
      ) {
        entryProblems.push(`entry ${index + 1} has no six-digit hex color`)
      }
      if (
        typeof label['description'] !== 'string' ||
        label['description'] === ''
      ) {
        entryProblems.push(`entry ${index + 1} has no description`)
      }
      return entryProblems
    })

    expect(problems).toEqual([])
  })

  test('label names are unique', () => {
    expect(declaredNames.size).toBe(declaredLabels.length)
  })
})

describe('label references', () => {
  test('every issue form references labels', () => {
    const formsWithLabels = new Set(
      issueFormReferences.map(({ source }) => source),
    )

    expect(formsWithLabels.size).toBe(issueFormFiles.length)
  })

  test('renovate.json5 references labels', () => {
    expect(renovateReferences.map(({ label }) => label)).toEqual(
      expect.arrayContaining(['dependencies', 'Type: Security']),
    )
  })

  test('every label an issue form references is declared', () => {
    expect(findMissingLabels(issueFormReferences, declaredNames)).toEqual([])
  })

  test('every label renovate.json5 references is declared', () => {
    expect(findMissingLabels(renovateReferences, declaredNames)).toEqual([])
  })

  test('a reference to an undeclared label is reported with its source', () => {
    const references = collectLabelReferences('renovate.json5', {
      labels: ['dependencies'],
      packageRules: [{ addLabels: ['Type: Imaginary'] }],
    })

    expect(findMissingLabels(references, declaredNames)).toEqual([
      'renovate.json5 references label "Type: Imaginary" missing from .github/labels.yml',
    ])
  })
})

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { parse } from 'yaml'

const GITHUB_DIRECTORY = path.resolve(import.meta.dirname, '../.github')
const ISSUE_FORMS_DIRECTORY = path.join(GITHUB_DIRECTORY, 'ISSUE_TEMPLATE')
const REPOSITORY_URL = 'https://github.com/andryorelabs/snug'
const GITHUB_REPOSITORY_URL_PATTERN = /github\.com\/[\w-]+\/[\w-]+/gi
const ISSUE_FORM_FILES = [
  '1-bug-report.yml',
  '2-feature-request.yml',
  '3-enhancement-request.yml',
  '4-documentation-bug.yml',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== ''
}

function findDuplicates(values: readonly unknown[]): unknown[] {
  const repeated = values.filter(
    (value, index) => values.indexOf(value) !== index,
  )
  return [...new Set(repeated)]
}

/**
 * Finds what makes a parsed issue form invalid: a missing name or description,
 * an empty body, no auto-applied labels, or a repeated input id or field label.
 * @param form A parsed issue form document.
 * @returns One line per problem, empty when the form is valid.
 */
function findIssueFormProblems(form: unknown): string[] {
  if (!isRecord(form)) return ['the form is not a mapping']
  const problems: string[] = []
  if (!isNonEmptyString(form['name'])) problems.push('missing name')
  if (!isNonEmptyString(form['description'])) {
    problems.push('missing description')
  }
  const labels = asArray(form['labels'])
  if (labels.length === 0) problems.push('applies no labels')
  for (const label of findDuplicates(labels)) {
    problems.push(`applies label "${String(label)}" twice`)
  }
  const inputs = asArray(form['body']).filter((element) => isRecord(element))
  if (inputs.length === 0) problems.push('empty body')
  const ids = inputs
    .map((element) => element['id'])
    .filter((id) => id !== undefined)
  for (const id of findDuplicates(ids)) {
    problems.push(`repeats input id "${String(id)}"`)
  }
  const fieldLabels = inputs
    .map((element) =>
      isRecord(element['attributes'])
        ? element['attributes']['label']
        : undefined,
    )
    .filter((label) => label !== undefined)
  for (const label of findDuplicates(fieldLabels)) {
    problems.push(`repeats field label "${String(label)}"`)
  }
  return problems
}

/**
 * Lists the GitHub repository URLs in a text that point at another repository.
 * @param text The raw content of a community file.
 * @returns Each `github.com/<owner>/<repo>` occurrence that is not this repo.
 */
function findForeignRepositoryLinks(text: string): string[] {
  return (text.match(GITHUB_REPOSITORY_URL_PATTERN) ?? []).filter(
    (link) => `https://${link}` !== REPOSITORY_URL,
  )
}

function readGithubFile(relativePath: string): string {
  return readFileSync(path.join(GITHUB_DIRECTORY, relativePath), 'utf8')
}

const config: unknown = parse(readGithubFile('ISSUE_TEMPLATE/config.yml'))
const contactLinks = asArray(isRecord(config) ? config['contact_links'] : [])
  .filter((link) => isRecord(link))
  .map((link) => String(link['url']))

describe('issue forms', () => {
  test('are the four numbered forms plus config.yml', () => {
    expect(
      readdirSync(ISSUE_FORMS_DIRECTORY).toSorted((first, second) =>
        first.localeCompare(second),
      ),
    ).toEqual([...ISSUE_FORM_FILES, 'config.yml'])
  })

  test.each(ISSUE_FORM_FILES)('%s is a valid form', (file) => {
    const form: unknown = parse(readGithubFile(`ISSUE_TEMPLATE/${file}`))

    expect(findIssueFormProblems(form)).toEqual([])
  })

  test('an incomplete form is reported problem by problem', () => {
    const form = {
      name: 'Bug Report',
      description: ' ',
      labels: ['Type: Bug', 'Type: Bug'],
      body: [
        { type: 'input', id: 'steps', attributes: { label: 'Steps' } },
        { type: 'textarea', id: 'steps', attributes: { label: 'Steps' } },
      ],
    }

    expect(findIssueFormProblems(form)).toEqual([
      'missing description',
      'applies label "Type: Bug" twice',
      'repeats input id "steps"',
      'repeats field label "Steps"',
    ])
  })

  test('a form without labels or body is reported', () => {
    expect(
      findIssueFormProblems({ name: 'Bug', description: 'A bug' }),
    ).toEqual(['applies no labels', 'empty body'])
  })
})

describe('issue template config.yml', () => {
  test('turns blank issues off', () => {
    expect(isRecord(config) && config['blank_issues_enabled']).toBe(false)
  })

  test('links the private security advisory form', () => {
    expect(contactLinks).toContain(`${REPOSITORY_URL}/security/advisories/new`)
  })

  test('has no Discussions link', () => {
    expect(contactLinks.filter((url) => url.includes('/discussions'))).toEqual(
      [],
    )
  })
})

describe('repository links in community files', () => {
  test.each([
    'SECURITY.md',
    'SUPPORT.md',
    'ISSUE_TEMPLATE/config.yml',
    ...ISSUE_FORM_FILES.map((file) => `ISSUE_TEMPLATE/${file}`),
  ])('%s only links this repository', (relativePath) => {
    expect(findForeignRepositoryLinks(readGithubFile(relativePath))).toEqual([])
  })

  test('a link to the former owner is reported', () => {
    expect(
      findForeignRepositoryLinks(
        'See https://github.com/AndryOre/snug/issues and https://github.com/andryorelabs/snug.',
      ),
    ).toEqual(['github.com/AndryOre/snug'])
  })

  test('SECURITY.md links the security advisory form', () => {
    expect(readGithubFile('SECURITY.md')).toContain(
      `${REPOSITORY_URL}/security/advisories/new`,
    )
  })
})

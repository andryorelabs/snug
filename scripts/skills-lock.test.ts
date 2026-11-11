import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '..')

/**
 * Skills committed under `.claude/skills` that are intentionally absent from
 * `skills-lock.json`, keyed by directory name with the reason.
 */
const UNLOCKED_SKILLS: Readonly<Record<string, string>> = {
  'playwright-trace':
    'Vendored with the Playwright skills in #52 without a lock entry.',
}

interface SkillsDisagreement {
  lockedButMissing: string[]
  installedButUnlocked: string[]
}

function sortNames(left: string, right: string): number {
  return left.localeCompare(right)
}

function compareSkills(
  locked: readonly string[],
  installed: readonly string[],
  unlocked: Readonly<Record<string, string>> = {},
): SkillsDisagreement {
  return {
    lockedButMissing: locked
      .filter((name) => !installed.includes(name))
      .toSorted(sortNames),
    installedButUnlocked: installed
      .filter(
        (name) => !locked.includes(name) && !Object.hasOwn(unlocked, name),
      )
      .toSorted(sortNames),
  }
}

function readLockedSkills(): string[] {
  const lock: unknown = JSON.parse(
    readFileSync(path.join(REPOSITORY_ROOT, 'skills-lock.json'), 'utf8'),
  )
  const skills = (lock as { skills?: Record<string, unknown> }).skills
  if (typeof skills !== 'object' || skills === null) {
    throw new Error('skills-lock.json has no "skills" object')
  }
  return Object.keys(skills)
}

function readInstalledSkills(): string[] {
  return readdirSync(path.join(REPOSITORY_ROOT, '.claude/skills'), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
}

test('skills-lock.json and .claude/skills agree in both directions', () => {
  expect(
    compareSkills(readLockedSkills(), readInstalledSkills(), UNLOCKED_SKILLS),
  ).toStrictEqual({ lockedButMissing: [], installedButUnlocked: [] })
})

test('every unlocked-skill exemption points at an installed skill', () => {
  const installed = readInstalledSkills()
  expect(
    Object.keys(UNLOCKED_SKILLS).filter((n) => !installed.includes(n)),
  ).toStrictEqual([])
})

test('compareSkills reports a locked skill with no directory', () => {
  expect(compareSkills(['a', 'b'], ['a'])).toStrictEqual({
    lockedButMissing: ['b'],
    installedButUnlocked: [],
  })
})

test('compareSkills reports an installed skill with no lock entry', () => {
  expect(compareSkills(['a'], ['a', 'c'])).toStrictEqual({
    lockedButMissing: [],
    installedButUnlocked: ['c'],
  })
})

test('compareSkills honours an exemption', () => {
  expect(compareSkills(['a'], ['a', 'c'], { c: 'local' })).toStrictEqual({
    lockedButMissing: [],
    installedButUnlocked: [],
  })
})

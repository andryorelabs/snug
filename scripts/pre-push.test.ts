import { describe, expect, it, vi } from 'vitest'

import {
  decidePush,
  parsePushLines,
  type PrePushDependencies,
  runPrePush,
  validateBranch,
} from './pre-push'

const ZERO = '0'.repeat(40)
const SHA = 'a'.repeat(40)

function pushLine(remoteReference: string, localSha = SHA): string {
  return `refs/heads/local ${localSha} ${remoteReference} ${ZERO}`
}

function dependencies(
  overrides: Partial<PrePushDependencies> = {},
): PrePushDependencies {
  return {
    hasOriginMain: () => true,
    runAffectedCheck: () => 0,
    log: vi.fn(),
    ...overrides,
  }
}

describe('validateBranch', () => {
  it.each([
    'feat/add-export',
    'fix/a.b_c-1',
    'chore/x',
    'ao-3034-agent-tooling',
    'ao-1-x',
    'renovate/bun-1.x',
    'worktree-agent-a2c7deb2efc230cb0',
  ])('accepts %s', (name) => {
    expect(validateBranch(name)).toBe(true)
  })

  it.each([
    'main',
    'feature/x',
    'feat/Upper',
    'feat/',
    'ao-x-slug',
    'ao-12',
    'worktree-',
    'random',
  ])('rejects %s', (name) => {
    expect(validateBranch(name)).toBe(false)
  })
})

describe('parsePushLines', () => {
  it('parses refs and ignores blank lines', () => {
    expect(
      parsePushLines(`${pushLine('refs/heads/feat/x')}\n\n`),
    ).toStrictEqual([{ localSha: SHA, remoteReference: 'refs/heads/feat/x' }])
  })
})

describe('decidePush', () => {
  it('refuses a push to main', () => {
    const decision = decidePush(parsePushLines(pushLine('refs/heads/main')))
    expect(decision.kind).toBe('reject')
  })

  it('refuses an invalid branch name', () => {
    const decision = decidePush(parsePushLines(pushLine('refs/heads/nope')))
    expect(decision).toMatchObject({ kind: 'reject' })
  })

  it('checks valid branches', () => {
    const input = [
      pushLine('refs/heads/ao-3034-x'),
      pushLine('refs/heads/worktree-agent-1'),
    ].join('\n')
    expect(decidePush(parsePushLines(input))).toStrictEqual({
      kind: 'check',
      branches: ['ao-3034-x', 'worktree-agent-1'],
    })
  })

  it('skips delete-only pushes', () => {
    const input = pushLine('refs/heads/nope', ZERO)
    expect(decidePush(parsePushLines(input))).toStrictEqual({ kind: 'skip' })
  })

  it('skips tag-only pushes', () => {
    const decision = decidePush(parsePushLines(pushLine('refs/tags/v1.0.0')))
    expect(decision).toStrictEqual({ kind: 'skip' })
  })

  it('skips an empty push', () => {
    expect(decidePush([])).toStrictEqual({ kind: 'skip' })
  })
})

describe('runPrePush', () => {
  it('exits 1 and logs when pushing to main', () => {
    const log = vi.fn()
    expect(runPrePush(pushLine('refs/heads/main'), dependencies({ log }))).toBe(
      1,
    )
    expect(log).toHaveBeenCalledOnce()
  })

  it('exits 0 for delete-only pushes without running the check', () => {
    const runAffectedCheck = vi.fn(() => 1)
    expect(
      runPrePush(
        pushLine('refs/heads/feat/x', ZERO),
        dependencies({ runAffectedCheck }),
      ),
    ).toBe(0)
    expect(runAffectedCheck).not.toHaveBeenCalled()
  })

  it('skips with a message when origin/main is missing', () => {
    const log = vi.fn()
    const runAffectedCheck = vi.fn(() => 1)
    const code = runPrePush(
      pushLine('refs/heads/feat/x'),
      dependencies({ hasOriginMain: () => false, log, runAffectedCheck }),
    )
    expect(code).toBe(0)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('origin/main'))
    expect(runAffectedCheck).not.toHaveBeenCalled()
  })

  it('prints what it runs and returns the check exit code', () => {
    const log = vi.fn()
    const code = runPrePush(
      pushLine('refs/heads/feat/x'),
      dependencies({ log, runAffectedCheck: () => 3 }),
    )
    expect(code).toBe(3)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('turbo run check'))
  })
})

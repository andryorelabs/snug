import { afterEach, describe, expect, it, vi } from 'vitest'

const originalExitCode = process.exitCode

afterEach(() => {
  process.exitCode = originalExitCode
  vi.doUnmock('./catalog')
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('i18n:status entry point', () => {
  it('prints the report of every non-English locale and exits cleanly', async () => {
    const spies = {
      out: vi.spyOn(process.stdout, 'write').mockImplementation(() => true),
    }

    await import('./i18n-status')

    const report = String(spies.out.mock.calls[0]?.[0])
    expect(report).toMatch(/^es: \d+ missing, \d+ stale, \d+ up to date$/m)
    expect(report).not.toMatch(/^en:/m)
    expect(process.exitCode).toBe(originalExitCode)
  })

  it('reports a failure on stderr and sets a non-zero exit code', async () => {
    vi.doMock('./catalog', () => ({
      loadLocalizedCatalog: () => {
        throw new Error('translation unreadable')
      },
    }))
    const spies = {
      error: vi.spyOn(process.stderr, 'write').mockImplementation(() => true),
    }

    await import('./i18n-status')

    expect(spies.error).toHaveBeenCalledWith(
      'i18n:status failed: translation unreadable\n',
    )
    expect(process.exitCode).toBe(1)
  })
})

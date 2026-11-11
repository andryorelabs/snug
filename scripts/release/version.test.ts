import { describe, expect, it } from 'vitest'

import { compareVersions, parseVersion, type Version } from './version'

function parsed(text: string): Version {
  const version = parseVersion(text)
  if (!version) {
    throw new Error(`${text} did not parse`)
  }
  return version
}

describe('parseVersion', () => {
  it('parses a plain version', () => {
    expect(parseVersion('2.4.0')).toEqual({
      major: 2,
      minor: 4,
      patch: 0,
      prerelease: [],
    })
  })

  it('parses a prerelease suffix', () => {
    expect(parseVersion('2.4.0-beta.1')?.prerelease).toEqual(['beta', '1'])
  })

  it.each([
    '',
    '2.4',
    '2.4.0.1',
    'v2.4.0',
    '02.4.0',
    '2.4.0-',
    '2.4.0-beta..1',
    '2.4.0-01',
    '2.4.0+build',
    '2.4.x',
    ' 2.4.0',
  ])('rejects %j', (text) => {
    expect(parseVersion(text)).toBeUndefined()
  })
})

describe('compareVersions', () => {
  it.each([
    ['2.4.0', '2.3.1'],
    ['2.3.2', '2.3.1'],
    ['3.0.0', '2.9.9'],
    ['2.10.0', '2.9.0'],
    ['2.4.0', '2.4.0-beta.1'],
    ['2.4.0-beta.1', '2.3.1'],
    ['2.4.0-beta.2', '2.4.0-beta.1'],
    ['2.4.0-beta.10', '2.4.0-beta.2'],
    ['2.4.0-beta.1', '2.4.0-beta'],
    ['2.4.0-beta', '2.4.0-alpha'],
    ['2.4.0-alpha', '2.4.0-1'],
  ])('%s is higher than %s', (higher, lower) => {
    expect(compareVersions(parsed(higher), parsed(lower))).toBeGreaterThan(0)
    expect(compareVersions(parsed(lower), parsed(higher))).toBeLessThan(0)
  })

  it('treats equal versions as equal', () => {
    expect(compareVersions(parsed('2.4.0-rc.1'), parsed('2.4.0-rc.1'))).toBe(0)
  })
})

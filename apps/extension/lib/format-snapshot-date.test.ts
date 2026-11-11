import { describe, expect, it } from 'vitest'

import { formatSnapshotDate } from './format-snapshot-date'

describe('formatSnapshotDate', () => {
  it('renders a medium date and a short time for the given epoch', () => {
    const takenAt = new Date(2026, 4, 17, 9, 5).getTime()
    const expected = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(takenAt)

    expect(formatSnapshotDate(takenAt)).toBe(expected)
    expect(formatSnapshotDate(takenAt)).toContain('2026')
  })

  it('gives different output for different moments', () => {
    expect(formatSnapshotDate(0)).not.toBe(formatSnapshotDate(86_400_000 * 40))
  })
})

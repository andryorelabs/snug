import { beforeEach, describe, expect, it } from 'vitest'

import { getImportModeItems } from './import-mode-items'
import { resetFakeI18n } from './testing/fake-i18n'

beforeEach(() => {
  resetFakeI18n()
})

describe('getImportModeItems', () => {
  it('lists every import mode with its localized label', () => {
    expect(getImportModeItems()).toEqual([
      { value: 'folder', label: 'Create folder' },
      { value: 'restore-merge', label: 'Restore — merge' },
      { value: 'restore-replace', label: 'Restore — replace' },
    ])
  })
})

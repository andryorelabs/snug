import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'

import {
  IMPORT_PROGRESS_BATCH_SIZE,
  ImportCanceledError,
  ImportWriter,
  markImportRestored,
  wasImportRestored,
  withImportRollback,
} from './import-control'
import { resetFakeBookmarks } from './testing/fake-bookmarks'

beforeEach(() => {
  resetFakeBookmarks()
})

const childIds = async (parentId: string) => {
  const [root] = await fakeBrowser.bookmarks.getTree()
  const parent = root?.children?.find((node) => node.id === parentId)
  return parent?.children?.map((node) => node.id) ?? []
}

describe('import restore marker', () => {
  it('remembers only the errors it was told about', () => {
    const marked = new Error('a')
    const other = new Error('b')

    markImportRestored(marked)

    expect(wasImportRestored(marked)).toBe(true)
    expect(wasImportRestored(other)).toBe(false)
  })

  it('ignores non-object values', () => {
    markImportRestored('text')
    markImportRestored(null)

    expect(wasImportRestored('text')).toBe(false)
    expect(wasImportRestored(null)).toBe(false)
  })
})

describe('ImportCanceledError', () => {
  it('carries whether existing bookmarks were already cleared', () => {
    const error = new ImportCanceledError(true)

    expect(error.name).toBe('ImportCanceledError')
    expect(error.message).toBe('Import canceled')
    expect(error.hasClearedExisting).toBe(true)
  })
})

describe('ImportWriter', () => {
  it('creates nodes and counts only bookmarks toward progress batches', async () => {
    const onProgress = vi.fn()
    const total = IMPORT_PROGRESS_BATCH_SIZE + 1
    const writer = new ImportWriter({ onProgress }, total, 4)
    const folder = await writer.create({ parentId: '1', title: 'Folder' })

    for (let index = 0; index < IMPORT_PROGRESS_BATCH_SIZE; index++) {
      await writer.create({
        parentId: folder.id,
        title: `B${index}`,
        url: `https://example.com/${index}`,
      })
    }
    expect(onProgress).toHaveBeenCalledTimes(1)
    expect(onProgress).toHaveBeenCalledWith({
      done: IMPORT_PROGRESS_BATCH_SIZE,
      total,
      skippedDuplicates: 4,
    })

    writer.finish()
    expect(onProgress).toHaveBeenCalledTimes(2)
  })

  it('refuses to create once the signal is aborted', async () => {
    const controller = new AbortController()
    const writer = new ImportWriter({ signal: controller.signal }, 1, 0)
    controller.abort()

    await expect(
      writer.create({ parentId: '1', title: 'X', url: 'https://x.example/' }),
    ).rejects.toBeInstanceOf(ImportCanceledError)
    expect(await childIds('1')).toEqual([])
  })

  it('tells a cancel that existing bookmarks were cleared', () => {
    const controller = new AbortController()
    const onClearingExisting = vi.fn()
    const writer = new ImportWriter(
      { signal: controller.signal, onClearingExisting },
      0,
      0,
    )

    writer.markClearingExisting()
    expect(onClearingExisting).toHaveBeenCalledOnce()

    controller.abort()
    expect(() => writer.throwIfAborted()).toThrow(
      expect.objectContaining({ hasClearedExisting: true }),
    )
  })

  it('rolls back only the top-level nodes it created, removing their subtrees', async () => {
    const existing = await fakeBrowser.bookmarks.create({
      parentId: '1',
      title: 'Mine',
      url: 'https://keep.example/',
    })
    const writer = new ImportWriter({}, 1, 0)
    const folder = await writer.create({ parentId: '1', title: 'Imported' })
    await writer.create({
      parentId: folder.id,
      title: 'Inner',
      url: 'https://inner.example/',
    })

    await writer.rollback()

    expect(await childIds('1')).toEqual([existing.id])
  })

  it('keeps removing after a failed removal and rethrows the first failure', async () => {
    const writer = new ImportWriter({}, 2, 0)
    const first = await writer.create({
      parentId: '1',
      title: 'A',
      url: 'https://a.example/',
    })
    const second = await writer.create({
      parentId: '1',
      title: 'B',
      url: 'https://b.example/',
    })
    const remove = vi
      .spyOn(fakeBrowser.bookmarks, 'removeTree')
      .mockRejectedValueOnce('boom')

    await expect(writer.rollback()).rejects.toThrow(
      'Failed to remove a created bookmark',
    )
    expect(remove).toHaveBeenCalledTimes(2)
    expect(await childIds('1')).toEqual([second.id])
    expect(await childIds('1')).not.toContain(first.id)
  })
})

describe('withImportRollback', () => {
  it('returns the step result without rolling back', async () => {
    const writer = new ImportWriter({}, 1, 0)

    await expect(withImportRollback(writer, async () => 7)).resolves.toBe(7)
  })

  it('rolls back and rethrows the original error', async () => {
    const writer = new ImportWriter({}, 1, 0)
    const failure = new Error('step failed')

    await expect(
      withImportRollback(writer, async () => {
        await writer.create({
          parentId: '1',
          title: 'A',
          url: 'https://a.example/',
        })
        throw failure
      }),
    ).rejects.toBe(failure)
    expect(await childIds('1')).toEqual([])
  })

  it('logs a failing rollback without replacing the original error', async () => {
    const writer = new ImportWriter({}, 1, 0)
    const failure = new Error('step failed')
    const log = vi.spyOn(console, 'error').mockImplementation(vi.fn())
    vi.spyOn(writer, 'rollback').mockRejectedValue(new Error('rollback failed'))

    await expect(
      withImportRollback(writer, async () => {
        throw failure
      }),
    ).rejects.toBe(failure)
    expect(log).toHaveBeenCalledWith(
      'Import rollback failed',
      expect.any(Error),
    )
  })
})

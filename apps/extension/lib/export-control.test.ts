import { describe, expect, it, vi } from 'vitest'

import { createExportTicker, ExportCanceledError } from './export-control'
import { IMPORT_PROGRESS_BATCH_SIZE } from './import-control'

describe('createExportTicker', () => {
  it('reports progress after every batch and once more on finish', () => {
    const onProgress = vi.fn()
    const total = IMPORT_PROGRESS_BATCH_SIZE * 2 + 3
    const ticker = createExportTicker({ onProgress }, total)

    for (let index = 0; index < total; index++) ticker.tick()
    expect(onProgress.mock.calls).toEqual([
      [{ done: IMPORT_PROGRESS_BATCH_SIZE, total }],
      [{ done: IMPORT_PROGRESS_BATCH_SIZE * 2, total }],
    ])

    ticker.finish()
    expect(onProgress).toHaveBeenLastCalledWith({ done: total, total })
  })

  it('works without a progress callback', () => {
    const ticker = createExportTicker({}, 1)
    expect(() => {
      ticker.tick()
      ticker.finish()
    }).not.toThrow()
  })

  it('throws ExportCanceledError from tick once aborted', () => {
    const controller = new AbortController()
    const ticker = createExportTicker({ signal: controller.signal }, 5)
    ticker.tick()

    controller.abort()

    expect(() => ticker.tick()).toThrow(ExportCanceledError)
  })

  it('throws ExportCanceledError from finish when aborted and reports nothing', () => {
    const controller = new AbortController()
    const onProgress = vi.fn()
    const ticker = createExportTicker(
      { signal: controller.signal, onProgress },
      0,
    )
    controller.abort()

    expect(() => ticker.finish()).toThrow('Export canceled')
    expect(onProgress).not.toHaveBeenCalled()
  })
})

describe('ExportCanceledError', () => {
  it('is a named Error', () => {
    const error = new ExportCanceledError()
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ExportCanceledError')
  })
})

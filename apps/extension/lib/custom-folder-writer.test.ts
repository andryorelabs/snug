import { describe, expect, it } from 'vitest'

import { writeToCustomFolder } from './custom-folder-writer'
import { FakeDirectoryHandle } from './testing/fake-directory-handle'

describe('writeToCustomFolder', () => {
  it('writes the file into the root and returns its name', async () => {
    const root = new FakeDirectoryHandle('root')

    const name = await writeToCustomFolder(
      root.asHandle(),
      '',
      'Bookmarks',
      'html',
      '<html>',
    )

    expect(name).toBe('Bookmarks.html')
    expect(root.files.get('Bookmarks.html')).toBe('<html>')
  })

  it('creates missing subfolders along the path', async () => {
    const root = new FakeDirectoryHandle('root')

    await writeToCustomFolder(root.asHandle(), 'a/b', 'x', 'json', '{}')

    expect(
      root.directories.get('a')?.directories.get('b')?.files.get('x.json'),
    ).toBe('{}')
  })

  it('never overwrites: adds a numeric suffix on collision', async () => {
    const root = new FakeDirectoryHandle('root')
    root.files.set('x.csv', 'old')
    root.files.set('x (1).csv', 'old1')

    const name = await writeToCustomFolder(
      root.asHandle(),
      '',
      'x',
      'csv',
      'new',
    )

    expect(name).toBe('x (2).csv')
    expect(root.files.get('x.csv')).toBe('old')
    expect(root.files.get('x (2).csv')).toBe('new')
  })

  it('propagates unexpected lookup errors', async () => {
    const root = new FakeDirectoryHandle('root')
    root.getFileHandle = async () => {
      throw new DOMException('denied', 'NotAllowedError')
    }

    await expect(
      writeToCustomFolder(root.asHandle(), '', 'x', 'csv', 'data'),
    ).rejects.toMatchObject({ name: 'NotAllowedError' })
  })

  it('aborts the writable and rethrows when writing fails', async () => {
    const root = new FakeDirectoryHandle('root')
    let didAbort = false
    const realGetFileHandle = root.getFileHandle.bind(root)
    root.getFileHandle = async (name, options) => {
      const handle = await realGetFileHandle(name, options)
      return {
        ...handle,
        createWritable: async () => ({
          write: async () => {
            throw new Error('disk full')
          },
          close: async () => {},
          abort: async () => {
            didAbort = true
          },
        }),
      }
    }

    await expect(
      writeToCustomFolder(root.asHandle(), '', 'x', 'csv', 'data'),
    ).rejects.toThrow('disk full')
    expect(didAbort).toBe(true)
  })
})

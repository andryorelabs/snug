import { spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  buildLycheeCacheRelativePath,
  buildLycheeDownloadUrl,
  buildLycheeLockRelativePath,
  ensureLycheeBinary,
  EXPECTED_LYCHEE_ACTION_VERSION,
  LYCHEE_ARGS,
  LYCHEE_VERSION,
  resolveLycheeArch,
} from './lint-docs'

const cacheRoot = vi.hoisted(() => ({ directory: '' }))

vi.mock('./locks', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveLockDirectory: (name: string) =>
    Promise.resolve(`${cacheRoot.directory}/${name}`),
}))

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const WORKFLOW_PATH = path.join(REPO_ROOT, '.github/workflows/lint-docs.yml')

/**
 * Splits a folded-scalar-joined argument string into tokens, treating a
 * `'single quoted'` run as one token (quotes stripped) the way a shell would
 * — mirrors how the workflow's quoting keeps `docs/**\/*.md` and
 * `.github/*.md` from being glob-expanded before lychee sees them.
 * @param input The folded-scalar-joined argument string to tokenize.
 * @returns The individual argument tokens, in order.
 */
function tokenizeShellLikeArguments(input: string): string[] {
  const tokens: string[] = []
  const pattern = /'([^']*)'|(\S+)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(input)) !== null) {
    const token = match[1] ?? match[2]
    if (token === undefined) {
      throw new Error(
        `tokenizeShellLikeArguments: neither alternation group matched for "${match[0]}" — this should be unreachable.`,
      )
    }
    tokens.push(token)
  }
  return tokens
}

/**
 * Pulls the `lycheeverse/lychee-action`'s `args:` YAML folded scalar
 * (`>-`) out of the workflow file and tokenizes it, without depending on a
 * full YAML parser — the block's shape is simple and stable enough (a fixed
 * indentation, no nested structures) that a small anchor-based extraction is
 * both sufficient and easier to audit than a parser dependency would be.
 * @param workflowYaml The workflow file's raw YAML content.
 * @returns The tokenized `args:` list, in the same order lychee receives them.
 */
function extractLycheeArgumentsFromWorkflow(workflowYaml: string): string[] {
  const blockMatch = /args:\s*>-\s*\n([\s\S]*?)\n\s*fail:/.exec(workflowYaml)
  const capturedBlock = blockMatch?.[1]
  if (capturedBlock === undefined) {
    throw new Error(
      'lint-docs.test: could not find the lychee-action "args:" block in ' +
        `${WORKFLOW_PATH} — has the workflow's format changed?`,
    )
  }
  const joinedLines = capturedBlock
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(' ')
  return tokenizeShellLikeArguments(joinedLines)
}

describe('LYCHEE_ARGS parity with .github/workflows/lint-docs.yml', () => {
  test('the script args match the lychee-action args byte-for-byte', () => {
    const workflowYaml = readFileSync(WORKFLOW_PATH, 'utf8')
    expect(extractLycheeArgumentsFromWorkflow(workflowYaml)).toEqual([
      ...LYCHEE_ARGS,
    ])
  })
})

describe('resolveLycheeArch', () => {
  test('maps arm64 to the aarch64 release asset arch', () => {
    expect(resolveLycheeArch('arm64', 'linux')).toBe('aarch64')
  })

  test('maps x64 to the x86_64 release asset arch', () => {
    expect(resolveLycheeArch('x64', 'linux')).toBe('x86_64')
  })

  test('throws for an architecture lychee does not publish a Linux binary for', () => {
    expect(() => resolveLycheeArch('ia32', 'linux')).toThrow(
      /unsupported architecture/,
    )
  })

  test('throws for a non-Linux platform, regardless of arch', () => {
    expect(() => resolveLycheeArch('arm64', 'darwin')).toThrow(
      /unsupported platform/,
    )
    expect(() => resolveLycheeArch('x64', 'win32')).toThrow(
      /unsupported platform/,
    )
  })
})

describe('EXPECTED_LYCHEE_ACTION_VERSION parity with .github/workflows/lint-docs.yml', () => {
  test('the workflow still pins the lychee-action version LYCHEE_VERSION assumes', () => {
    const workflowYaml = readFileSync(WORKFLOW_PATH, 'utf8')
    const match = /uses:\s*lycheeverse\/lychee-action@\S+\s*#\s*(v[\d.]+)/.exec(
      workflowYaml,
    )
    const pinnedVersion = match?.[1]
    if (pinnedVersion === undefined) {
      throw new Error(
        'lint-docs.test: could not find the pinned lychee-action version ' +
          `comment in ${WORKFLOW_PATH} — has the workflow's format changed?`,
      )
    }
    expect(pinnedVersion).toBe(EXPECTED_LYCHEE_ACTION_VERSION)
  })
})

describe('buildLycheeDownloadUrl', () => {
  test('builds the pinned version release asset URL for an arch', () => {
    expect(buildLycheeDownloadUrl(LYCHEE_VERSION, 'x86_64')).toBe(
      `https://github.com/lycheeverse/lychee/releases/download/lychee-${LYCHEE_VERSION}/lychee-x86_64-unknown-linux-gnu.tar.gz`,
    )
  })
})

describe('buildLycheeCacheRelativePath', () => {
  test('nests the cached binary under lychee/<version>/lychee', () => {
    expect(buildLycheeCacheRelativePath('v0.24.2')).toBe(
      path.join('lychee', 'v0.24.2', 'lychee'),
    )
  })
})

describe('buildLycheeLockRelativePath', () => {
  test('is a flat name distinct from the binary cache path, one level under --git-common-dir', () => {
    expect(buildLycheeLockRelativePath('v0.24.2')).toBe('lychee-v0.24.2.lock')
  })
})

/**
 * Vitest workers do not expose the `Bun` global, so the two members the
 * download path uses are backed by Node primitives with the same contract.
 */
function installBunShim(): void {
  vi.stubGlobal('Bun', {
    write: async (destination: string, response: Response) => {
      writeFileSync(destination, Buffer.from(await response.arrayBuffer()))
    },
    spawn: (options: { cmd: string[] }) => {
      const [command, ...commandArguments] = options.cmd
      const child = spawn(command ?? '', commandArguments, {
        stdio: ['ignore', 'ignore', 'pipe'],
      })
      return {
        exited: new Promise<number>((resolve) => {
          child.on('close', (code) => resolve(code ?? 1))
        }),
        stderr: Readable.toWeb(child.stderr),
      }
    },
  })
}

/**
 * Builds a real `.tar.gz` holding the given relative files.
 * @param workingDirectory Scratch directory to build the archive in.
 * @param files Map of archive-relative path to file content.
 * @returns The archive bytes.
 */
function buildTarball(
  workingDirectory: string,
  files: Record<string, string>,
): Buffer {
  const source = path.join(workingDirectory, 'source')
  for (const [relativePath, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(source, relativePath)), {
      recursive: true,
    })
    writeFileSync(path.join(source, relativePath), content)
  }
  const archivePath = path.join(workingDirectory, 'fixture.tar.gz')
  const result = spawnSync('tar', ['-czf', archivePath, '-C', source, '.'])
  if (result.status !== 0) throw new Error('lint-docs.test: tar failed')
  return readFileSync(archivePath)
}

const binaryPath = () =>
  path.join(cacheRoot.directory, buildLycheeCacheRelativePath('v9.9.9'))
const lockPath = () =>
  path.join(cacheRoot.directory, buildLycheeLockRelativePath('v9.9.9'))

describe('ensureLycheeBinary', () => {
  let scratch: string
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    scratch = mkdtempSync(path.join(tmpdir(), 'lint-docs-ensure-'))
    cacheRoot.directory = path.join(scratch, 'git')
    mkdirSync(cacheRoot.directory)
    installBunShim()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'log').mockImplementation(vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    rmSync(scratch, { recursive: true, force: true })
  })

  test('returns a cached binary without touching the network', async () => {
    mkdirSync(path.dirname(binaryPath()), { recursive: true })
    writeFileSync(binaryPath(), 'cached')

    await expect(ensureLycheeBinary('v9.9.9')).resolves.toBe(binaryPath())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('downloads, extracts a nested binary, makes it executable and releases the lock', async () => {
    const tarball = buildTarball(scratch, {
      'lychee-x86_64-unknown-linux-gnu/lychee': '#!/bin/sh\n',
    })
    fetchMock.mockResolvedValue(new Response(new Uint8Array(tarball)))

    await expect(ensureLycheeBinary('v9.9.9')).resolves.toBe(binaryPath())
    expect(readFileSync(binaryPath(), 'utf8')).toBe('#!/bin/sh\n')
    expect(statSync(binaryPath()).mode & 0o111).not.toBe(0)
    expect(existsSync(lockPath())).toBe(false)
  })

  test('reports the URL and a manual-install hint when the request fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))

    await expect(ensureLycheeBinary('v9.9.9')).rejects.toThrow(
      /failed to download lychee from .*lychee-v9\.9\.9.*offline.*manually/s,
    )
    expect(existsSync(lockPath())).toBe(false)
  })

  test('reports the HTTP status when the release asset is missing', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 404 }))

    await expect(ensureLycheeBinary('v9.9.9')).rejects.toThrow(/HTTP 404/)
    expect(existsSync(binaryPath())).toBe(false)
  })

  test('fails when the download is not a tar archive', async () => {
    fetchMock.mockResolvedValue(new Response('not an archive'))

    await expect(ensureLycheeBinary('v9.9.9')).rejects.toThrow(
      /failed to extract the lychee archive/,
    )
  })

  test('fails when the archive holds no lychee binary', async () => {
    const tarball = buildTarball(scratch, { 'readme.txt': 'hello' })
    fetchMock.mockResolvedValue(new Response(new Uint8Array(tarball)))

    await expect(ensureLycheeBinary('v9.9.9')).rejects.toThrow(
      /could not find a "lychee" binary/,
    )
    expect(existsSync(lockPath())).toBe(false)
  })
})

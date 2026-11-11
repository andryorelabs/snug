import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

interface TurboTask {
  inputs?: string[]
}

const turboConfig = JSON.parse(
  readFileSync(new URL('../turbo.json', import.meta.url), 'utf8'),
) as { tasks: Record<string, TurboTask> }

const ROOT_TEST_TASKS = ['//#test:root', '//#test:coverage:root']

describe('root test task inputs', () => {
  test.each(ROOT_TEST_TASKS)(
    '%s hashes every tracked file, because its tests scan the whole repository',
    (taskName) => {
      expect(turboConfig.tasks[taskName]?.inputs).toEqual(['$TURBO_DEFAULT$'])
    },
  )
})

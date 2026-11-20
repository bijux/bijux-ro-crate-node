import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {collectRootTests} from '../testing/root-tests.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const heavy = {
  'workspace-build': 'tests/ci/workspace-build.test.ts',
  'installed-workspaces': 'tests/ci/installed-workspace-consumers.test.ts',
  'compiler-contract': 'tests/ci/workspace-compiler-contract.test.ts',
} as const

export function partitionRootTests(all: string[]) {
  assert.equal(new Set(all).size, all.length, 'Duplicate root test file')
  const isolated = Object.values(heavy) as string[]
  for (const path of isolated) assert.ok(all.includes(path), 'Missing isolated root test: ' + path)
  const ordinary = all.filter(path => !isolated.includes(path))
  assert.ok(ordinary.length >= 2, 'Not enough ordinary root tests for both lanes')
  const lanes: Record<string, string[]> = {
    'ordinary-1': ordinary.filter((_, index) => index % 2 === 0),
    'ordinary-2': ordinary.filter((_, index) => index % 2 === 1),
    ...Object.fromEntries(Object.entries(heavy).map(([name, path]) => [name, [path]])),
  }
  return {all, lanes}
}

export async function collectRootTestLanes() {
  return partitionRootTests(await collectRootTests('all'))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [lane, ...extra] = process.argv.slice(2)
  assert.ok(lane && !extra.length, 'Expected one root test lane')
  const {lanes} = await collectRootTestLanes()
  assert.ok(Object.hasOwn(lanes, lane), 'Unknown root test lane: ' + lane)
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...lanes[lane]], {cwd: root, stdio: 'inherit'})
  if (result.error) throw result.error
  if (result.signal) process.kill(process.pid, result.signal)
  process.exit(result.status ?? 1)
}

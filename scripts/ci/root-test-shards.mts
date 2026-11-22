import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {collectRootTests} from '../testing/root-tests.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const heavy = {
  'workspace-build': 'tests/tooling/build/workspace.test.ts',
  'compiler-contract': 'tests/tooling/typescript/compiler-contract.test.ts',
} as const
const installedWorkspaceTest = 'tests/tooling/packages/installed-workspaces.test.ts'
const installedWorkspacePatterns: Record<string, string> = {
  'installed-workspaces-contracts': '^(?:public package consumers require an exact owned scenario and transitive workspace closure|prepared inventory must match every public workspace including dependency versions|installed workspace (?:node type guard|browser type guard|runtime guard))$',
  'installed-workspaces-scenarios': '^installed workspace (?:scenario verification|preparation verification)$',
  'installed-workspaces-assets': '^installed workspace (?:tampering verification|restore and execution)$',
}

export function rootTestLaneArgs(lane: string, files: string[]): string[] {
  const pattern = installedWorkspacePatterns[lane]
  return pattern ? ['--test-name-pattern', pattern, ...files] : files
}

export function partitionRootTests(all: string[]) {
  assert.equal(new Set(all).size, all.length, 'Duplicate root test file')
  const isolated = [...Object.values(heavy), installedWorkspaceTest] as string[]
  for (const path of isolated) assert.ok(all.includes(path), 'Missing isolated root test: ' + path)
  const ordinary = all.filter(path => !isolated.includes(path))
  assert.ok(ordinary.length >= 2, 'Not enough ordinary root tests for both lanes')
  const lanes: Record<string, string[]> = {
    'ordinary-1': ordinary.filter((_, index) => index % 2 === 0),
    'ordinary-2': ordinary.filter((_, index) => index % 2 === 1),
    ...Object.fromEntries(Object.entries(heavy).map(([name, path]) => [name, [path]])),
    ...Object.fromEntries(Object.keys(installedWorkspacePatterns).map(name => [name, [installedWorkspaceTest]])),
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
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...rootTestLaneArgs(lane, lanes[lane])], {cwd: root, stdio: 'inherit'})
  if (result.error) throw result.error
  if (result.signal) process.kill(process.pid, result.signal)
  process.exit(result.status ?? 1)
}

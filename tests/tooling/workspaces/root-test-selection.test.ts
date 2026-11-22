import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import test from 'node:test'
import {auditRootTestOwnership, collectRootTestOwnership, collectRootTests} from '../../../scripts/testing/root-tests.mjs'

async function fixture() {
  const base = resolve('artifacts/work')
  await mkdir(base, {recursive: true})
  const directory = await mkdtemp(base + '/root-selection-')
  for (const file of ['tests/browser/file-access.test.ts', 'tests/tooling/reference/capture-cli.test.ts', 'tests/reference/competing-collections/contracts.test.mts', 'tests/reference/competing-collections/contracts.test.mjs', 'tests/ci/nested/contracts.test.ts']) {
    await mkdir(resolve(directory, file, '..'), {recursive: true})
    await writeFile(resolve(directory, file), '')
  }
  return directory
}

test('ordinary selection discovers nested tests and executes generated pairs once', async t => {
  const root = await fixture()
  t.after(() => rm(root, {recursive: true, force: true}))
  const options = {root, plan: {referenceGroups: {}, upstreamReferenceFamilies: []}}
  const rows = await collectRootTestOwnership(options)
  const selected = await collectRootTests('all', options)
  assert.ok(selected.includes('tests/ci/nested/contracts.test.ts'))
  assert.equal(selected.filter(path => path.includes('competing-collections/contracts.test')).length, 1)
  assert.ok(rows.find(row => row.source.endsWith('contracts.test.mts') && row.execution.endsWith('.mjs')))
  await auditRootTestOwnership(options)
})

test('audit rejects authored tests that have no execution owner', async t => {
  const root = await fixture()
  t.after(() => rm(root, {recursive: true, force: true}))
  await mkdir(resolve(root, 'tests/unowned'), {recursive: true})
  await writeFile(resolve(root, 'tests/unowned/missing.test.ts'), '')
  await assert.rejects(auditRootTestOwnership({root, plan: {referenceGroups: {}, upstreamReferenceFamilies: []}}), /missing\.test\.ts/)
})

test('a test can have ordinary and specialized owners without executing twice', async t => {
  const root = await fixture()
  t.after(() => rm(root, {recursive: true, force: true}))
  const path = 'tests/ci/nested/contracts.test.ts'
  const plan = {upstreamReferenceFamilies: [], referenceGroups: {extra: [{command: process.execPath, args: ['--test', path]}]}}
  const options = {root, plan}
  const row = (await collectRootTestOwnership(options)).find(item => item.source === path)!
  assert.deepEqual(row.ordinaryScopes, ['all', 'tooling'])
  assert.deepEqual(row.specializedCommands, ['extra:1'])
  assert.equal((await collectRootTests('all', options)).filter(item => item === path).length, 1)
})

test('stale exceptions, duplicate commands and unknown scopes fail closed', async t => {
  const root = await fixture()
  t.after(() => rm(root, {recursive: true, force: true}))
  const path = 'tests/ci/nested/contracts.test.ts'
  const plan = {upstreamReferenceFamilies: [], referenceGroups: {bad: [{command: process.execPath, args: ['--test', path, path]}]}}
  await assert.rejects(collectRootTestOwnership({root, plan}), /Duplicate test/)
  await assert.rejects(collectRootTests('invalid' as 'all', {root}), /Invalid root test scope/)
  await rm(resolve(root, 'tests/browser/file-access.test.ts'))
  await assert.rejects(collectRootTestOwnership({root, plan: {referenceGroups: {}, upstreamReferenceFamilies: []}}), /ENOENT|does not exist/)
})


test('root test command rejects invalid scopes, incomplete selectors and positional files', () => {
  const runner = new URL('../../../scripts/testing/root-tests.mjs', import.meta.url)
  for (const args of [['--scope', 'invalid', '--audit'], ['--scope', 'tooling', '--test-name-pattern'],
    ['--scope', 'tooling', 'tests/ci/required-jobs.test.ts'], ['--json']]) {
    const result = spawnSync(process.execPath, [runner.pathname, ...args], {encoding: 'utf8'})
    assert.notEqual(result.status, 0, args.join(' '))
  }
})

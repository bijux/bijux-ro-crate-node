import assert from 'node:assert/strict'
import {mkdir, mkdtemp, rm, symlink, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import test from 'node:test'
import {validateFixture} from '../../package/harness/fixtures.mjs'

async function fixture() {
  await mkdir('artifacts/work', {recursive: true})
  const root = await mkdtemp(resolve('artifacts/work/fixture-descriptor-'))
  await mkdir(resolve(root, 'sources'))
  await writeFile(resolve(root, 'sources/node.ts'), 'export const value = 1\n')
  await writeFile(resolve(root, 'sources/browser.ts'), 'export const value = 1\n')
  return {root, fixture: {
    files: [{source: 'sources/node.ts', target: 'node.ts'}, {source: 'sources/browser.ts', target: 'browser.ts'}],
    nodeRoots: ['node.ts'], browserRoots: ['browser.ts'], runtimeEntry: {source: 'node.ts', output: 'consumer.mjs'},
    required: [{packageName: '@fixture/example', export: '.', environment: 'node' as const}, {packageName: '@fixture/example', export: '.', environment: 'browser' as const}],
  }}
}

test('consumer fixtures reject paths outside the owning repository and duplicate destinations', async t => {
  const {root, fixture: valid} = await fixture()
  t.after(() => rm(root, {recursive: true, force: true}))
  await validateFixture(root, valid)
  await assert.rejects(validateFixture(root, {...valid, files: [{source: '../outside', target: 'node.ts'}]}), /path/i)
  await assert.rejects(validateFixture(root, {...valid, files: [...valid.files, {...valid.files[0]}]}), /duplicate/i)
  await assert.rejects(validateFixture(root, {...valid, files: [{source: 'sources/node.ts', target: '../escape.ts'}]}), /path/i)
  await mkdir(resolve(root, 'node_modules'))
  await writeFile(resolve(root, 'node_modules/generated.ts'), 'export {}')
  await assert.rejects(validateFixture(root, {...valid, files: [{source: 'node_modules/generated.ts', target: 'node.ts'}]}), /repository-owned/i)
  await symlink(resolve(root, 'node_modules/generated.ts'), resolve(root, 'sources/generated.ts'))
  await assert.rejects(validateFixture(root, {...valid, files: [{source: 'sources/generated.ts', target: 'node.ts'}]}), /repository-owned/i)
  await symlink('/etc/hosts', resolve(root, 'sources/outside.ts'))
  await assert.rejects(validateFixture(root, {...valid, files: [{source: 'sources/outside.ts', target: 'node.ts'}]}), /escape/i)
})

test('consumer fixtures require checked roots and distinct emitted targets', async t => {
  const {root, fixture: valid} = await fixture()
  t.after(() => rm(root, {recursive: true, force: true}))
  await assert.rejects(validateFixture(root, {...valid, runtimeEntry: {source: 'missing.ts', output: 'consumer.mjs'}}), /root/i)
  await assert.rejects(validateFixture(root, {...valid, runtimeEntry: {source: 'node.ts', output: 'browser.ts'}}), /output/i)
  await assert.rejects(validateFixture(root, {...valid, required: []}), /public/i)
  await assert.rejects(validateFixture(root, {...valid, files: [{source: 'sources/node.ts', target: 'node_modules/example/index.ts'}]}), /reserved/i)
  await assert.rejects(validateFixture(root, {...valid, runtimeEntry: {source: 'node.ts', output: 'node_modules/example/consumer.mjs'}}), /reserved/i)
})

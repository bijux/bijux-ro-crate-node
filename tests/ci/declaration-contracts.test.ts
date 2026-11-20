import assert from 'node:assert/strict'
import {mkdir, mkdtemp, rm, symlink, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import test from 'node:test'
import {verifyDeclarations, verifyPublicDeclarationDependencies} from '../../scripts/build/declarations.mjs'

async function fixture() {
  await mkdir('artifacts/work', {recursive: true})
  const root = await mkdtemp(resolve('artifacts/work/declarations-'))
  const output = resolve(root, 'dist')
  await mkdir(output)
  return {root, output}
}

test('declaration graph rejects missing and escaped relative references', async t => {
  const {root, output} = await fixture()
  t.after(() => rm(root, {recursive: true, force: true}))
  const entry = resolve(output, 'index.d.ts')
  await writeFile(entry, "export type {Value} from './value.js'\n")
  await assert.rejects(verifyDeclarations(output), /Missing declaration dependency/)
  await writeFile(resolve(output, 'value.d.ts'), 'export type Value = string\n')
  await verifyDeclarations(output)
  await rm(resolve(output, 'value.d.ts'))
  await writeFile(resolve(root, 'outside.d.ts'), 'export type Value = string\n')
  await symlink(resolve(root, 'outside.d.ts'), resolve(output, 'value.d.ts'))
  await assert.rejects(verifyDeclarations(output), /Declaration escapes package/)
})

test('public declarations reject unexported self imports and undeclared external types', async t => {
  const {root, output} = await fixture()
  t.after(() => rm(root, {recursive: true, force: true}))
  const entry = resolve(output, 'index.d.ts')
  const exports = {'.': {types: './dist/index.d.ts'}}
  await writeFile(entry, "export type {Value} from '@fixture/package/private'\n")
  await assert.rejects(verifyPublicDeclarationDependencies(output, exports, '@fixture/package', new Set()), /Unexported self declaration dependency/)
  await writeFile(entry, "import type {Stats} from 'node:fs'\nexport type Value = Stats\n")
  await assert.rejects(verifyPublicDeclarationDependencies(output, exports, '@fixture/package', new Set()), /Undeclared declaration dependency: @types\/node/)
  await verifyPublicDeclarationDependencies(output, exports, '@fixture/package', new Set(['@types/node']))
})

test('declaration references resolve independently in ESM and CommonJS modes', async t => {
  const {root, output} = await fixture()
  t.after(() => rm(root, {recursive: true, force: true}))
  await writeFile(resolve(output, 'common.d.cts'), 'export interface Shared {value: string}\n')
  await writeFile(resolve(output, 'module.d.mts'), 'export interface Shared {value: string}\n')
  await writeFile(resolve(output, 'index.d.cts'), "export type {Shared} from './common.cjs'\n")
  await writeFile(resolve(output, 'index.d.mts'), "export type {Shared} from './module.mjs'\n")
  await verifyDeclarations(output)
  await rm(resolve(output, 'common.d.cts'))
  await assert.rejects(verifyDeclarations(output), /Missing declaration dependency/)
})

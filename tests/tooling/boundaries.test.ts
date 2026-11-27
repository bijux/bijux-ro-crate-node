import assert from 'node:assert/strict'
import {mkdir, mkdtemp, rm, symlink, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import test from 'node:test'
import {checkBoundaries, type BoundaryPackage} from '../../scripts/testing/boundaries.mjs'

test('workspace boundaries admit public dependencies and reject private or test escapes', async () => {
  const parent = resolve('artifacts/work')
  await mkdir(parent, {recursive: true})
  const root = await mkdtemp(resolve(parent, 'boundary-fixture-'))
  const write = async (name: string, contents: string) => {
    const file = resolve(root, name)
    await mkdir(resolve(file, '..'), {recursive: true})
    await writeFile(file, contents)
  }
  const packages: BoundaryPackage[] = [
    {name: '@fixture/core', directory: 'core', dependencies: {}, exports: {'.': {types: './dist/index.d.ts', import: './dist/index.js'}}},
    {name: '@fixture/validator', directory: 'validator', dependencies: {'@fixture/core': '1.0.0'}, exports: {'.': {import: './dist/index.js'}}},
  ]
  try {
    await write('packages/core/src/index.ts', 'export interface Value {name: string}\n')
    await write('packages/core/package.json', JSON.stringify({name: '@fixture/core', type: 'module', exports: packages[0].exports}))
    await mkdir(resolve(root, 'node_modules/@fixture'), {recursive: true})
    await symlink(resolve(root, 'packages/core'), resolve(root, 'node_modules/@fixture/core'))
    await write('packages/core/src/private.ts', 'export interface Secret {name: string}\n')
    await write('tests/helper.ts', 'export const helper = 1\n')
    await write('packages/validator/tests/helper.ts', 'export const helper = 1\n')
    await write('scripts/ci/run.mts', 'export const run = 1\n')
    await write('tests/support/helper.mts', 'export const helper = 1\n')
    await write('packages/validator/src/index.ts', "import type {Value} from '@fixture/core'\nexport type {Value}\n")
    await checkBoundaries(root, packages)
    packages[1].dependencies = {}
    packages[1].peerDependencies = {'@fixture/core': '^1.0.0'}
    await checkBoundaries(root, packages)
    packages[1].peerDependencies = {}
    await assert.rejects(checkBoundaries(root, packages), /boundary/i)
    packages[1].dependencies = {'@fixture/core': '1.0.0'}
    await write('packages/validator/src/helper.ts', 'export const value = 1\n')
    await write('packages/validator/src/index.ts', "export const load = () => import('./helper.js')\n")
    await checkBoundaries(root, packages)
    for (const contents of [
      "import type {Secret} from '../../core/src/private.js'\nexport type {Secret}\n",
      "export {helper} from '../../../tests/helper.js'\n",
      "import helper = require('../../../tests/helper.js')\nexport {helper}\n",
      "export const load = () => import('../../../tests/helper.js')\n",
      "export const load = () => import(`../../../tests/helper.js`)\n",
      "export {helper} from '../tests/helper.js'\n",
      "import type {Secret} from '@fixture/core/private'\nexport type {Secret}\n",
    ]) {
      await write('packages/validator/src/index.ts', contents)
      await assert.rejects(checkBoundaries(root, packages), /boundary/i)
    }
    await write('packages/validator/src/index.ts', 'export const valid = true\n')
    await write('packages/validator/tsconfig.json', JSON.stringify({compilerOptions: {baseUrl: '.', paths: {'@fixture/core': ['../core/src/private.ts']}}}))
    await write('packages/validator/src/index.ts', "import type {Value} from '@fixture/core'\nexport type {Value}\n")
    await assert.rejects(checkBoundaries(root, packages), /boundary/i)
    await rm(resolve(root, 'packages/validator/tsconfig.json'))
    await write('packages/validator/src/index.ts', 'export const valid = true\n')
    const link = resolve(root, 'packages/validator/src/alias.ts')
    await symlink(resolve(root, 'packages/core/src/private.ts'), link)
    await assert.rejects(checkBoundaries(root, packages), /boundary/i)
    await rm(link)
    await write('tests/support/helper.mts', "export {run} from '../../scripts/ci/run.mjs'\n")
    await assert.rejects(checkBoundaries(root, packages), /boundary/i)
  } finally {await rm(root, {recursive: true, force: true})}
})

for (const [owner, file, packages] of [
  ['package source', 'packages/validator/src/index.ts', [{name:'@fixture/validator', directory:'validator'}]],
  ['shared support', 'tests/support/helper.mts', []],
] as const) for (const [loader, expression] of [
  ['dynamic import', 'import(path)'],
  ['require', 'require(path)'],
] as const) test(`${owner} rejects computed ${loader}`, async () => {
  const parent = resolve('artifacts/work')
  await mkdir(parent, {recursive:true})
  const root = await mkdtemp(resolve(parent, 'boundary-computed-import-'))
  try {
    await mkdir(resolve(root, file, '..'), {recursive:true})
    await writeFile(resolve(root, file), `const path = '../../../tests/helper.js'\nexport const load = () => ${expression}\n`)
    await assert.rejects(checkBoundaries(root, packages), /non-literal.*module/i)
  } finally {await rm(root, {recursive:true, force:true})}
})

for (const [name, setup] of [
  ['test command import', async (root: string) => {
    await writeFile(resolve(root, 'tests/ci/verify-coverage.mts'), 'export const command = 1\n')
    await writeFile(resolve(root, 'tests/support/helper.mts'), "export {command} from '../ci/verify-coverage.mjs'\n")
  }],
  ['support symlink to test command', async (root: string) => {
    await writeFile(resolve(root, 'tests/ci/verify-coverage.mts'), 'export const command = 1\n')
    await symlink(resolve(root, 'tests/ci/verify-coverage.mts'), resolve(root, 'tests/support/helper.mts'))
  }],
  ['browser command import', async (root: string) => {
    await mkdir(resolve(root, 'tests/browser'), {recursive: true})
    await writeFile(resolve(root, 'tests/browser/parity.mts'), 'export {}\nconsole.log("browser command")\n')
    await writeFile(resolve(root, 'tests/support/helper.mts'), "import '../browser/parity.mjs'\n")
  }],
  ['tooling-project alias to a CI command', async (root: string) => {
    await writeFile(resolve(root, 'scripts/ci/run.mts'), 'export const command = 1\n')
    await writeFile(resolve(root, 'tsconfig.json'), JSON.stringify({files: [], references: []}))
    await writeFile(resolve(root, 'tsconfig.tooling.json'), JSON.stringify({compilerOptions: {module: 'NodeNext', moduleResolution: 'NodeNext', baseUrl: '.', paths: {'@ci/*': ['scripts/ci/*']}}}))
    await writeFile(resolve(root, 'tests/support/helper.mts'), "export {command} from '@ci/run.mjs'\n")
  }],
  ['dependency symlink to a CI command', async (root: string) => {
    await mkdir(resolve(root, 'node_modules'), {recursive: true})
    await writeFile(resolve(root, 'tests/ci/package.json'), JSON.stringify({name: 'ci-alias', types: './run.d.ts'}))
    await writeFile(resolve(root, 'tests/ci/run.d.ts'), 'export const command: number\n')
    await symlink(resolve(root, 'tests/ci'), resolve(root, 'node_modules/ci-alias'))
    await writeFile(resolve(root, 'tests/support/helper.mts'), "export {command} from 'ci-alias'\n")
  }],
] as const) test('shared support rejects ' + name, async () => {
  const parent = resolve('artifacts/work')
  await mkdir(parent, {recursive: true})
  const root = await mkdtemp(resolve(parent, 'boundary-support-'))
  try {
    for (const path of ['tests/support', 'tests/ci', 'scripts/ci']) await mkdir(resolve(root, path), {recursive: true})
    await setup(root)
    await assert.rejects(checkBoundaries(root, []), /boundary/i)
  } finally {await rm(root, {recursive: true, force: true})}
})

test('shared support may export a value prepared with top-level await', async () => {
  const parent = resolve('artifacts/work')
  await mkdir(parent, {recursive: true})
  const root = await mkdtemp(resolve(parent, 'boundary-support-await-'))
  try {
    await mkdir(resolve(root, 'tests/support'), {recursive: true})
    await mkdir(resolve(root, 'node_modules/example-package'), {recursive: true})
    await writeFile(resolve(root, 'node_modules/example-package/package.json'), JSON.stringify({name: 'example-package', types: './index.d.ts'}))
    await writeFile(resolve(root, 'node_modules/example-package/index.d.ts'), 'export const external: number\n')
    await writeFile(resolve(root, 'tests/support/value.mts'), 'export const value = await Promise.resolve(1)\n')
    await writeFile(resolve(root, 'tests/support/helper.mts'), "export {value} from './value.mjs'\nexport {external} from 'example-package'\n")
    await checkBoundaries(root, [])
  } finally {await rm(root, {recursive: true, force: true})}
})

test('shared support inspects JavaScript intermediaries even beside TypeScript files', async () => {
  const parent = resolve('artifacts/work')
  await mkdir(parent, {recursive: true})
  const root = await mkdtemp(resolve(parent, 'boundary-support-javascript-'))
  try {
    for (const path of ['tests/support', 'scripts/ci']) await mkdir(resolve(root, path), {recursive: true})
    await writeFile(resolve(root, 'scripts/ci/command.mjs'), 'export const command = 1\n')
    await writeFile(resolve(root, 'tests/support/helper.mts'), "export {command} from './intermediary.mjs'\n")
    await writeFile(resolve(root, 'tests/support/intermediary.mts'), 'export const command = 1\n')
    await writeFile(resolve(root, 'tests/support/intermediary.mjs'), "export {command} from '../../scripts/ci/command.mjs'\n")
    await assert.rejects(checkBoundaries(root, []), /boundary/i)
    await writeFile(resolve(root, 'tests/support/intermediary.mjs'), 'export const command = 1\n')
    await checkBoundaries(root, [])
    await writeFile(resolve(root, 'tests/support/intermediary.cjs'), "module.exports = require('../../scripts/ci/command.mjs')\n")
    await assert.rejects(checkBoundaries(root, []), /boundary/i)
    await writeFile(resolve(root, 'tests/support/intermediary.cjs'), "module.exports = () => import('../../scripts/ci/command.mjs')\n")
    await assert.rejects(checkBoundaries(root, []), /boundary/i)
    await rm(resolve(root, 'tests/support/intermediary.cjs'))
    await mkdir(resolve(root, 'packages/validator/src'), {recursive: true})
    await writeFile(resolve(root, 'packages/validator/src/bridge.js'), "export {command} from '../../../scripts/ci/command.mjs'\n")
    await assert.rejects(checkBoundaries(root, [{name: '@fixture/validator', directory: 'validator'}]), /boundary/i)
  } finally {await rm(root, {recursive: true, force: true})}
})

test('external declarations cannot conceal a repository runtime entry', async () => {
  const parent = resolve('artifacts/work')
  await mkdir(parent, {recursive: true})
  const root = await mkdtemp(resolve(parent, 'boundary-runtime-'))
  try {
    for (const path of ['tests/support', 'scripts/ci', 'node_modules/example']) await mkdir(resolve(root, path), {recursive: true})
    await writeFile(resolve(root, 'node_modules/example/package.json'), JSON.stringify({name: 'example', type: 'module', exports: {'.': {types: './index.d.ts', import: './entry.mjs', require: './entry.mjs'}}}))
    await writeFile(resolve(root, 'node_modules/example/index.d.ts'), 'export const value: number\n')
    await writeFile(resolve(root, 'node_modules/example/entry.mts'), 'export const value = 1\n')
    await writeFile(resolve(root, 'scripts/ci/run.mjs'), 'export const value = 1\n')
    await symlink(resolve(root, 'scripts/ci/run.mjs'), resolve(root, 'node_modules/example/entry.mjs'))
    await writeFile(resolve(root, 'tests/support/helper.mts'), "import type {value} from 'example'; export type Value = typeof value\n")
    await checkBoundaries(root, [])
    await writeFile(resolve(root, 'tests/support/helper.mts'), "import {value} from 'example'; export {value}\n")
    await assert.rejects(checkBoundaries(root, []), /boundary/i)
    await writeFile(resolve(root, 'tests/support/helper.mts'), "export const value = require('example')\n")
    await assert.rejects(checkBoundaries(root, []), /boundary/i)
    await writeFile(resolve(root, 'tests/support/helper.mts'), 'export {}\n')
    await mkdir(resolve(root, 'packages/validator/src'), {recursive: true})
    await writeFile(resolve(root, 'packages/validator/src/index.ts'), "import {value} from 'example'; export {value}\n")
    await assert.rejects(checkBoundaries(root, [{name: '@fixture/validator', directory: 'validator'}]), /boundary/i)
  } finally {await rm(root, {recursive: true, force: true})}
})

test('linked external dependencies and Node builtins remain available to support', async () => {
  const parent = resolve('artifacts/work')
  await mkdir(parent, {recursive: true})
  const root = await mkdtemp(resolve(parent, 'boundary-linked-consumer-'))
  const external = await mkdtemp(resolve(parent, 'boundary-linked-package-'))
  try {
    await mkdir(resolve(root, 'tests/support'), {recursive: true})
    await mkdir(resolve(root, 'node_modules'), {recursive: true})
    await writeFile(resolve(external, 'package.json'), JSON.stringify({name: 'example', type: 'module', exports: {'.': {types: './index.d.ts', import: './index.mjs'}}}))
    await writeFile(resolve(external, 'index.d.ts'), 'export const value: number\n')
    await writeFile(resolve(external, 'index.mjs'), 'export const value = 1\n')
    await symlink(external, resolve(root, 'node_modules/example'))
    await writeFile(resolve(root, 'tests/support/helper.mts'), "import {value} from 'example'; import assert from 'node:assert/strict'; assert.equal(value, 1)\n")
    await checkBoundaries(root, [])
  } finally {await rm(root, {recursive: true, force: true}); await rm(external, {recursive: true, force: true})}
})

for (const replacement of ['nested package', 'workspace symlink'] as const) test('workspace imports reject ' + replacement, async () => {
  const parent = resolve('artifacts/work')
  await mkdir(parent, {recursive: true})
  const root = await mkdtemp(resolve(parent, 'boundary-package-'))
  const write = async (path: string, contents: string) => {
    const file = resolve(root, path)
    await mkdir(resolve(file, '..'), {recursive: true})
    await writeFile(file, contents)
  }
  const exports = {'.': {types: './dist/index.d.ts', import: './dist/index.js'}}
  const packages: BoundaryPackage[] = [
    {name: '@fixture/core', directory: 'core', exports},
    {name: '@fixture/validator', directory: 'validator', dependencies: {'@fixture/core': '1.0.0'}, exports},
  ]
  try {
    for (const name of ['core', 'validator']) {
      await write(`packages/${name}/package.json`, JSON.stringify({name: '@fixture/' + name, type: 'module', exports}))
      await write(`packages/${name}/src/index.ts`, name === 'validator' ? "import {value} from '@fixture/core'; export {value}\n" : 'export const value = 1\n')
      await write(`packages/${name}/dist/index.d.ts`, 'export declare const value: number\n')
      await write(`packages/${name}/dist/index.js`, 'export const value = 1\n')
    }
    await mkdir(resolve(root, 'node_modules/@fixture'), {recursive: true})
    await symlink(resolve(root, 'packages/core'), resolve(root, 'node_modules/@fixture/core'))
    await checkBoundaries(root, packages)
    await rm(resolve(root, 'packages/core/dist/index.d.ts'))
    await rm(resolve(root, 'packages/core/dist/index.js'))
    await checkBoundaries(root, packages)
    await rm(resolve(root, 'packages/core/src/index.ts'))
    await assert.rejects(checkBoundaries(root, packages), /boundary/i)
    await write('packages/core/src/index.ts', 'export const value = 1\n')
    await write('packages/core/dist/index.d.ts', 'export declare const value: number\n')
    await write('packages/core/dist/index.js', 'export const value = 1\n')
    await write('packages/core/src/private.js', 'export const value = 2\n')
    await rm(resolve(root, 'packages/core/dist/index.js'))
    await symlink(resolve(root, 'packages/core/src/private.js'), resolve(root, 'packages/core/dist/index.js'))
    await assert.rejects(checkBoundaries(root, packages), /boundary/i)
    await rm(resolve(root, 'packages/core/dist/index.js'))
    await write('packages/core/dist/index.js', 'export const value = 1\n')
    const nested = resolve(root, 'packages/validator/node_modules/@fixture/core')
    await mkdir(resolve(nested, '..'), {recursive: true})
    if (replacement === 'workspace symlink') await symlink(resolve(root, 'packages/validator'), nested)
    else {
      await write('packages/validator/node_modules/@fixture/core/package.json', JSON.stringify({name: '@fixture/core', type: 'module', exports: {'.': {types: './private.d.ts', import: './private.js'}}}))
      await write('packages/validator/node_modules/@fixture/core/private.d.ts', 'export declare const value: number\n')
      await write('packages/validator/node_modules/@fixture/core/private.js', 'export const value = 2\n')
    }
    await assert.rejects(checkBoundaries(root, packages), /boundary/i)
  } finally {await rm(root, {recursive: true, force: true})}
})

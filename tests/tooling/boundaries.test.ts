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
    {name: '@fixture/core', directory: 'core', dependencies: {}, exports: {'.': {import: './dist/index.js'}}},
    {name: '@fixture/validator', directory: 'validator', dependencies: {'@fixture/core': '1.0.0'}, exports: {'.': {import: './dist/index.js'}}},
  ]
  try {
    await write('packages/core/src/index.ts', 'export interface Value {name: string}\n')
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

import assert from 'node:assert/strict'
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import test from 'node:test'

const workspace = fileURLToPath(new URL('../../', import.meta.url))
const guard = fileURLToPath(new URL('../package/runtime-guard.mjs', import.meta.url))

for (const mode of ['esm', 'commonjs'] as const) test(`installed ${mode} dependencies cannot resolve from an ancestor`, async () => {
  await mkdir(resolve(workspace, 'artifacts/work'), {recursive: true})
  const root = await mkdtemp(resolve(workspace, 'artifacts/work/consumer-resolution-'))
  const consumer = resolve(root, 'consumer')
  try {
    await mkdir(resolve(consumer, 'node_modules/example'), {recursive: true})
    await mkdir(resolve(root, 'node_modules/ambient'), {recursive: true})
    await writeFile(resolve(root, 'node_modules/ambient/index.js'), 'module.exports = 7')
    await writeFile(resolve(consumer, 'node_modules/example/package.json'), JSON.stringify({name: 'example', main: 'index.' + (mode === 'esm' ? 'mjs' : 'cjs')}))
    await writeFile(resolve(consumer, 'node_modules/example/index.' + (mode === 'esm' ? 'mjs' : 'cjs')), mode === 'esm' ? "import value from 'ambient'; export default value" : "module.exports = require('ambient')")
    const script = resolve(consumer, 'consumer.mjs')
    await writeFile(script, "import value from 'example'; if (value !== 7) throw new Error('unexpected')")
    const run = () => spawnSync(process.execPath, ['--import', guard, script], {cwd: consumer, encoding: 'utf8', env: {...process.env, BIJUX_CONSUMER_ROOT: consumer}})
    const rejected = run()
    assert.notEqual(rejected.status, 0)
    assert.match(rejected.stderr, /outside installed consumer/)
    await mkdir(resolve(consumer, 'node_modules/ambient'))
    await writeFile(resolve(consumer, 'node_modules/ambient/index.js'), 'module.exports = 7')
    const accepted = run()
    assert.equal(accepted.status, 0, accepted.stderr)
  } finally { await rm(root, {recursive: true, force: true}) }
})

test('installed declarations cannot resolve types from an ancestor', async () => {
  await mkdir(resolve(workspace, 'artifacts/work'), {recursive: true})
  const root = await mkdtemp(resolve(workspace, 'artifacts/work/consumer-types-'))
  const consumer = resolve(root, 'consumer')
  try {
    await mkdir(resolve(consumer, 'node_modules/example/dist'), {recursive: true})
    await mkdir(resolve(consumer, 'browser-types'))
    await mkdir(resolve(root, 'node_modules/ambient'), {recursive: true})
    await writeFile(resolve(root, 'node_modules/ambient/package.json'), JSON.stringify({name: 'ambient', types: './index.d.ts'}))
    await writeFile(resolve(root, 'node_modules/ambient/index.d.ts'), 'export type Value = number')
    await writeFile(resolve(consumer, 'node_modules/example/package.json'), JSON.stringify({name: 'example', type: 'module', exports: {'.': {types: './dist/index.d.ts', import: './dist/index.js'}}}))
    await writeFile(resolve(consumer, 'node_modules/example/dist/index.d.ts'), "import type {Value} from 'ambient'; export declare const value: Value")
    await writeFile(resolve(consumer, 'consumer.ts'), "import {value} from 'example'; const result: number = value; void result")
    const checker = fileURLToPath(new URL('../package/typecheck.mjs', import.meta.url))
    const run = () => spawnSync(process.execPath, [checker, consumer, 'example', 'browser'], {cwd: workspace, encoding: 'utf8'})
    const rejected = run()
    assert.notEqual(rejected.status, 0)
    assert.match(rejected.stderr, /Cannot find module 'ambient'/)
    await mkdir(resolve(consumer, 'node_modules/ambient'))
    await writeFile(resolve(consumer, 'node_modules/ambient/package.json'), JSON.stringify({name: 'ambient', types: './index.d.ts'}))
    await writeFile(resolve(consumer, 'node_modules/ambient/index.d.ts'), 'export type Value = number')
    const accepted = run()
    assert.equal(accepted.status, 0, accepted.stderr)
  } finally { await rm(root, {recursive: true, force: true}) }
})

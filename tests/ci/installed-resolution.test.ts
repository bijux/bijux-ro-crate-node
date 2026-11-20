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

test('a receipt requires the installed target to load even for default exports', async () => {
  const {createHash} = await import('node:crypto')
  const {readFile} = await import('node:fs/promises')
  const {planConsumers, runScenarios} = await import('../package/install.mjs')
  await mkdir(resolve(workspace, 'artifacts/work'), {recursive: true})
  const root = await mkdtemp(resolve(workspace, 'artifacts/work/consumer-load-'))
  try {
    const directory = resolve(root, 'artifacts/consumers/example')
    const packageDirectory = resolve(directory, 'node_modules/example')
    await mkdir(packageDirectory, {recursive: true})
    await writeFile(resolve(packageDirectory, 'package.json'), JSON.stringify({name: 'example', type: 'module', exports: './index.js'}))
    await writeFile(resolve(packageDirectory, 'index.js'), 'export default 7')
    const script = resolve(directory, 'consumer.mjs')
    const packages = [{name: 'example', directory: 'example', version: '1.0.0', dependencies: {}, archive: '', sha256: '', integrity: '', files: []}]
    const plans = planConsumers(packages, new Map([['example', async () => ({code: '', nodeTypes: '', browserTypes: ''})]]))
    const proof = {consumers: [{name: 'example', packages: [{name: 'example', entry: 'artifacts/consumers/example/node_modules/example/index.js'}], scenario_sha256: 'expected', type_evidence: []}]}
    const execute = (args: string[], env: NodeJS.ProcessEnv) => {
      const child = spawnSync(process.execPath, args, {cwd: directory, encoding: 'utf8', env: {...process.env, ...env}})
      assert.equal(child.status, 0, child.stderr)
      return child.stdout
    }
    await writeFile(script, 'void 0')
    await assert.rejects(runScenarios(plans, proof, root, execute, process.versions.node), /did not load/)
    await writeFile(script, "import value from 'example'; if (value !== 7) throw new Error('unexpected')")
    const [receipt] = await runScenarios(plans, proof, root, execute, process.versions.node)
    assert.equal(createHash('sha256').update(await readFile(resolve(root, receipt.load_evidence))).digest('hex'), receipt.load_evidence_sha256)
  } finally { await rm(root, {recursive: true, force: true}) }
})

for (const options of ['', ', {execArgv: []}', ', {execArgv: [], env: {}}', ', {execArgv: [], env: SHARE_ENV}']) test('worker modules cannot resolve dependencies from an ancestor with ' + (options || 'default options'), async () => {
  await mkdir(resolve(workspace, 'artifacts/work'), {recursive: true})
  const root = await mkdtemp(resolve(workspace, 'artifacts/work/consumer-worker-'))
  const consumer = resolve(root, 'consumer')
  try {
    await mkdir(resolve(consumer, 'node_modules'), {recursive: true})
    await mkdir(resolve(root, 'node_modules/ambient'), {recursive: true})
    await writeFile(resolve(root, 'node_modules/ambient/index.js'), 'module.exports = 7')
    await writeFile(resolve(consumer, 'worker.mjs'), "import value from 'ambient'; if (value !== 7) throw new Error('unexpected')")
    const script = resolve(consumer, 'consumer.mjs')
    await writeFile(script, "import {Worker, SHARE_ENV} from 'node:worker_threads'; new Worker(new URL('./worker.mjs', import.meta.url)" + options + ")")
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

test('worker-only installed module loads produce evidence with an explicit environment', async () => {
  const {createHash} = await import('node:crypto')
  const {readFile} = await import('node:fs/promises')
  const {planConsumers, runScenarios} = await import('../package/install.mjs')
  await mkdir(resolve(workspace, 'artifacts/work'), {recursive: true})
  const root = await mkdtemp(resolve(workspace, 'artifacts/work/worker-evidence-'))
  try {
    const directory = resolve(root, 'artifacts/consumers/example')
    const packageDirectory = resolve(directory, 'node_modules/example')
    await mkdir(packageDirectory, {recursive: true})
    await writeFile(resolve(packageDirectory, 'package.json'), JSON.stringify({name: 'example', type: 'module', exports: './index.js'}))
    await writeFile(resolve(packageDirectory, 'index.js'), 'export default 7')
    await writeFile(resolve(directory, 'worker.mjs'), "import value from 'example'; if (value !== 7) throw new Error('unexpected')")
    const packages = [{name: 'example', directory: 'example', version: '1.0.0', dependencies: {}, archive: '', sha256: '', integrity: '', files: []}]
    const plans = planConsumers(packages, new Map([['example', async () => ({code: '', nodeTypes: '', browserTypes: ''})]]))
    const proof = {consumers: [{name: 'example', packages: [{name: 'example', entry: 'artifacts/consumers/example/node_modules/example/index.js'}], scenario_sha256: 'expected', type_evidence: []}]}
    const execute = (args: string[], env: NodeJS.ProcessEnv) => {
      const child = spawnSync(process.execPath, args, {cwd: directory, encoding: 'utf8', env: {...process.env, ...env}})
      assert.equal(child.status, 0, child.stderr)
      return child.stdout
    }
    for (const env of [{}, {NODE_V8_COVERAGE: resolve(root, 'foreign-coverage')}]) {
      await writeFile(resolve(directory, 'consumer.mjs'), `import {Worker} from 'node:worker_threads'; const worker = new Worker(new URL('./worker.mjs', import.meta.url), {execArgv: [], env: ${JSON.stringify(env)}}); await new Promise((resolve, reject) => {worker.on('error', reject); worker.on('exit', code => code === 0 ? resolve() : reject(new Error('worker failed')))})`)
      const [receipt] = await runScenarios(plans, proof, root, execute, process.versions.node)
      assert.equal(createHash('sha256').update(await readFile(resolve(root, receipt.load_evidence))).digest('hex'), receipt.load_evidence_sha256)
    }
  } finally { await rm(root, {recursive: true, force: true}) }
})

test('worker environment rejects preloads before they can execute and keeps benign options', async () => {
  const {pathToFileURL} = await import('node:url')
  const {access} = await import('node:fs/promises')
  await mkdir(resolve(workspace, 'artifacts/work'), {recursive: true})
  const root = await mkdtemp(resolve(workspace, 'artifacts/work/worker-preload-'))
  const consumer = resolve(root, 'consumer')
  try {
    await mkdir(consumer, {recursive: true})
    const marker = resolve(root, 'outside-executed')
    const preload = resolve(root, 'preload.mjs')
    await writeFile(preload, `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'executed')`)
    await writeFile(resolve(consumer, 'worker.mjs'), 'export {}')
    const script = resolve(consumer, 'consumer.mjs')
    const run = () => spawnSync(process.execPath, ['--import', guard, script], {cwd: consumer, encoding: 'utf8', env: {...process.env, BIJUX_CONSUMER_ROOT: consumer}})
    await writeFile(script, `import {Worker} from 'node:worker_threads'; new Worker(new URL('./worker.mjs', import.meta.url), {env: {NODE_OPTIONS: ${JSON.stringify('--import=' + pathToFileURL(preload).href)}}})`)
    const rejected = run()
    assert.notEqual(rejected.status, 0)
    assert.match(rejected.stderr, /preload/i)
    await assert.rejects(access(marker), {code: 'ENOENT'})
    await writeFile(script, "import {Worker} from 'node:worker_threads'; new Worker(new URL('./worker.mjs', import.meta.url), {env: {NODE_OPTIONS: '--trace-warnings'}})")
    const accepted = run()
    assert.equal(accepted.status, 0, accepted.stderr)
  } finally { await rm(root, {recursive: true, force: true}) }
})

test('preload detection rejects import, require and loader flags without rejecting ordinary options', async () => {
  const {assertNoPreloads} = await import('../package/node-options.mjs')
  for (const options of ['--import=example', '--import example', '"--require" "example"', '-r example', '-rexample', '--loader=example', '--experimental-loader example']) {
    assert.throws(() => assertNoPreloads(options), /preload/i, options)
  }
  for (const options of [undefined, '', '--trace-warnings', '--trace-warnings --max-old-space-size=1024', '--redirect-warnings="/path/--import.log"']) {
    assert.doesNotThrow(() => assertNoPreloads(options), String(options))
  }
})

test('qualification rejects inherited preloads before executing a consumer', async () => {
  const {runScenarios} = await import('../package/install.mjs')
  const previous = process.env.NODE_OPTIONS
  try {
    process.env.NODE_OPTIONS = '--require=outside'
    await assert.rejects(runScenarios([], {consumers: []}, workspace, () => {throw new Error('executed')}, process.versions.node), /preload/i)
  } finally {
    if (previous === undefined) delete process.env.NODE_OPTIONS
    else process.env.NODE_OPTIONS = previous
  }
})

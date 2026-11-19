import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {copyFile, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {test, type TestContext} from 'node:test'
import {fileURLToPath} from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))

async function fixture(t: TestContext): Promise<string> {
  const artifacts = resolve(root, 'artifacts/work')
  await mkdir(artifacts, {recursive: true})
  const directory = await mkdtemp(resolve(artifacts, 'parity-launcher-'))
  t.after(() => rm(directory, {recursive: true, force: true}))
  await mkdir(resolve(directory, 'scripts'), {recursive: true})
  await mkdir(resolve(directory, 'tests/parity'), {recursive: true})
  await copyFile(resolve(root, 'scripts/parity.mjs'), resolve(directory, 'scripts/parity.mjs'))
  await writeFile(resolve(directory, 'tests/parity/run.mjs'), `
console.log(JSON.stringify({argv: process.argv.slice(2), execArgv: process.execArgv, hasBinding: Object.hasOwn(process.env, 'BIJUX_VALIDATOR_MODULE'), binding: process.env.BIJUX_VALIDATOR_MODULE ?? null, nodeOptions: process.env.NODE_OPTIONS ?? null}))
if (process.env.BIJUX_PARITY_TEST_SIGNAL) process.kill(process.pid, process.env.BIJUX_PARITY_TEST_SIGNAL)
process.exit(Number(process.env.BIJUX_PARITY_TEST_EXIT ?? 0))
`)
  return directory
}

function launch(directory: string, variables: NodeJS.ProcessEnv = {}) {
  const env = {...process.env}
  delete env.NODE_OPTIONS
  delete env.BIJUX_VALIDATOR_MODULE
  Object.assign(env, variables)
  return spawnSync(process.execPath, [resolve(directory, 'scripts/parity.mjs'), '--snapshot', 'extra'], {cwd: root, env, encoding: 'utf8'})
}

test('parity launcher selects the loader from presence of the installed module binding', async t => {
  const directory = await fixture(t)
  for (const binding of [undefined, '', 'file:///installed/index.js']) {
    const result = launch(directory, binding === undefined ? {} : {BIJUX_VALIDATOR_MODULE: binding})
    assert.equal(result.status, 0, result.stderr)
    const receipt = JSON.parse(result.stdout) as {argv: string[], execArgv: string[], hasBinding: boolean, binding: string | null, nodeOptions: string | null}
    assert.deepEqual(receipt.argv, ['--snapshot', 'extra'])
    assert.deepEqual(receipt.execArgv, binding === undefined ? ['--import', 'tsx'] : [])
    assert.equal(receipt.hasBinding, binding !== undefined)
    assert.equal(receipt.binding, binding ?? null)
    assert.equal(receipt.nodeOptions, null)
  }
})

test('parity launcher forwards child exit status and termination signal', async t => {
  const directory = await fixture(t)
  const exited = launch(directory, {BIJUX_VALIDATOR_MODULE: '', BIJUX_PARITY_TEST_EXIT: '17'})
  assert.equal(exited.status, 17, exited.stderr)
  const signaled = launch(directory, {BIJUX_VALIDATOR_MODULE: '', BIJUX_PARITY_TEST_SIGNAL: 'SIGTERM'})
  assert.equal(signaled.signal, 'SIGTERM', signaled.stderr)
})

test('runtime entry generation rejects stale output and reproduces the checked-in launcher', async t => {
  const directory = await fixture(t)
  for (const name of ['generate-runtime-entries.mts', 'parity.mts', 'workspaces.mts', 'workspaces.mjs', 'build.mts', 'build.mjs', 'typecheck.mts', 'typecheck.mjs', 'test-discovery.mts', 'test-discovery.mjs']) {
    await copyFile(resolve(root, 'scripts', name), resolve(directory, 'scripts', name))
  }
  await mkdir(resolve(directory, 'scripts/ci'), {recursive: true})
  for (const name of ['require-jobs.mts', 'require-jobs.mjs', 'browser-checks.mts', 'browser-checks.mjs', 'reference-execution.mts', 'reference-execution.mjs', 'reference-checks.mts', 'reference-checks.mjs', 'runtime-bundles.mts', 'runtime-bundles.mjs']) {
    await copyFile(resolve(root, 'scripts/ci', name), resolve(directory, 'scripts/ci', name))
  }
  await mkdir(resolve(directory, 'scripts/release'), {recursive: true})
  for (const name of ['pack.mts', 'pack.mjs']) {
    await copyFile(resolve(root, 'scripts/release', name), resolve(directory, 'scripts/release', name))
  }
  await mkdir(resolve(directory, 'scripts/http'), {recursive: true})
  for (const name of ['server.mts', 'server.mjs', 'example.mts', 'example.mjs']) {
    await copyFile(resolve(root, 'scripts/http', name), resolve(directory, 'scripts/http', name))
  }
  await mkdir(resolve(directory, 'scripts/reference'), {recursive: true})
  for (const name of ['oracle-partitions.mts', 'oracle-partitions.mjs', 'capture-profile-literal-targets.mts', 'capture-profile-literal-targets.mjs']) {
    await copyFile(resolve(root, 'scripts/reference', name), resolve(directory, 'scripts/reference', name))
  }
  for (const name of ['snapshot-partitions.mts', 'snapshot-partitions.mjs', 'run.mts', 'run.mjs', 'qualification.mts', 'qualification.mjs', 'cases.mts', 'cases.mjs', 'tsv-cases.mts', 'tsv-cases.mjs', 'workload-cases.mts', 'workload-cases.mjs', 'inputs.mts', 'inputs.mjs', 'normalize.mts', 'normalize.mjs', 'compare.mts', 'compare.mjs']) {
    await copyFile(resolve(root, 'tests/parity', name), resolve(directory, 'tests/parity', name))
  }
  for (const reference of ['root-context-propagation', 'manifest-inference', 'key-equality', 'converter-failures', 'disabled-context-terms', 'xml-name-edition', 'html-tree-building', 'manifest-numeric-identity', 'blank-node-diagnostics', 'jsonld-graph-contexts', 'temporal-literals', 'jsonld-processing', 'url-authorities']) {
    await mkdir(resolve(directory, 'tests/reference', reference), {recursive: true})
    for (const extension of ['mts', 'mjs'])
      await copyFile(resolve(root, 'tests/reference', reference, 'verify-capture.' + extension), resolve(directory, 'tests/reference', reference, 'verify-capture.' + extension))
  }
  for (const reference of ['manifest-inference', 'manifest-numeric-identity'])
    for (const extension of ['mts', 'mjs'])
      await copyFile(resolve(root, `tests/reference/${reference}/checks.${extension}`), resolve(directory, `tests/reference/${reference}/checks.${extension}`))
  for (const [reference, name] of [
    ['root-context-propagation', 'verify-import-primitive'], ['jsonld-processing', 'portable'],
    ['jsonld-graph-contexts', 'checks'], ['upstream-defects', 'checks'],
    ['upstream-defects', 'constraint-report'], ['temporal-literals', 'checks'],
    ['root-context-propagation', 'checks'], ['url-authorities', 'checks'],
    ['inferred-collections', 'checks'], ['inferred-collections', 'capture-records'], ['inferred-collections', 'capture-original'], ['inferred-collections', 'run'], ['inferred-collections', 'verify-capture'],
    ['blank-node-diagnostics', 'checks'], ['blank-node-diagnostics', 'correction-bounds'],
    ['jsonld-processing', 'run'],
    ['temporal-literals', 'run'],
    ['root-context-propagation', 'run'],
    ['url-authorities', 'run'],
    ['upstream-defects', 'run'],
    ['profile-literal-targets', 'checks'], ['profile-literal-targets', 'run'], ['manifest-inference', 'run'], ['manifest-numeric-identity', 'run'], ['xml-name-edition', 'run'], ['literal-grammar', 'checks'], ['literal-grammar', 'run'],
    ['jsonld-processing', 'checks'], ['reserved-type-identifiers/observers', 'checks'], ['reserved-type-identifiers/observers', 'run'], ['reserved-type-identifiers/observers', 'verify-capture'],
    ['jsonld-graph-contexts', 'contracts.test'],
    ['temporal-literals', 'contracts.test'],
    ['competing-collections', 'contracts.test'],
    ['html-tree-building', 'checks'], ['html-tree-building', 'run'], ['html-tree-building', 'dom-proof'], ['xml-name-edition', 'checks'], ['xml-name-edition', 'names'],
  ]) {
    await mkdir(resolve(directory, 'tests/reference', reference), {recursive: true})
    for (const extension of ['mts', 'mjs'])
      await copyFile(resolve(root, 'tests/reference', reference, name + '.' + extension), resolve(directory, 'tests/reference', reference, name + '.' + extension))
  }
  await mkdir(resolve(directory, 'tests/reference/collection-diagnostics'), {recursive: true})
  for (const name of ['checks', 'run', 'verify-capture'])
    for (const extension of ['mts', 'mjs'])
      await copyFile(resolve(root, `tests/reference/collection-diagnostics/${name}.${extension}`), resolve(directory, `tests/reference/collection-diagnostics/${name}.${extension}`))
  await mkdir(resolve(directory, 'tests/reference/model-type-prefixes'), {recursive: true})
  for (const name of ['checks', 'verify-capture', 'run'])
    for (const extension of ['mts', 'mjs'])
      await copyFile(resolve(root, `tests/reference/model-type-prefixes/${name}.${extension}`), resolve(directory, `tests/reference/model-type-prefixes/${name}.${extension}`))
  for (const name of ['checks', 'run'])
    for (const extension of ['mts', 'mjs'])
      await copyFile(resolve(root, `tests/reference/disabled-context-terms/${name}.${extension}`), resolve(directory, `tests/reference/disabled-context-terms/${name}.${extension}`))
  for (const name of ['checks', 'run'])
    for (const extension of ['mts', 'mjs'])
      await copyFile(resolve(root, `tests/reference/key-equality/${name}.${extension}`), resolve(directory, `tests/reference/key-equality/${name}.${extension}`))
  await mkdir(resolve(directory, 'tests/parity/corpus'), {recursive: true})
  for (const name of ['dates', 'integers', 'nonfinite', 'datatypes', 'paths', 'urls', 'manifest-records', 'manifest-chunks', 'ontology', 'rdf-semantics', 'jsonld', 'collections'])
    for (const extension of ['mts', 'mjs'])
      await copyFile(resolve(root, `tests/parity/corpus/${name}.${extension}`), resolve(directory, `tests/parity/corpus/${name}.${extension}`))
  await mkdir(resolve(directory, 'tests/browser'), {recursive: true})
  for (const name of ['host.mts', 'host.mjs', 'draft-editor.mts', 'draft-editor.mjs', 'report-display.mts', 'report-display.mjs', 'continuation-parity.mts', 'continuation-parity.mjs', 'selected-colon-paths.mts', 'selected-colon-paths.mjs', 'native-file-values.mts', 'native-file-values.mjs', 'text-file-values.mts', 'text-file-values.mjs', 'root-identity.mts', 'root-identity.mjs', 'file-path-ownership.mts', 'file-path-ownership.mjs', 'upstream-defects.mts', 'upstream-defects.mjs', 'offline.mts', 'offline.mjs', 'repair.mts', 'repair.mjs', 'races.mts', 'races.mjs', 'observe-worker.mts', 'observe-worker.js'])
    await copyFile(resolve(root, 'tests/browser', name), resolve(directory, 'tests/browser', name))
  await mkdir(resolve(directory, 'tests/browser/metadata'), {recursive: true})
  for (const name of ['jsonld-processing', 'model-type-prefixes', 'reserved-types', 'literal-grammar', 'urls'])
    for (const extension of ['mts', 'mjs'])
      await copyFile(resolve(root, `tests/browser/metadata/${name}.${extension}`), resolve(directory, `tests/browser/metadata/${name}.${extension}`))
  for (const [directoryName, names] of [['manifest', ['numeric-identity']], ['profile', ['collection-diagnostics', 'inferred-collections']]] as const) {
    await mkdir(resolve(directory, 'tests/browser', directoryName), {recursive: true})
    for (const name of names) for (const extension of ['mts', 'mjs'])
      await copyFile(resolve(root, `tests/browser/${directoryName}/${name}.${extension}`), resolve(directory, `tests/browser/${directoryName}/${name}.${extension}`))
  }
  await mkdir(resolve(directory, 'tests/browser/session'), {recursive: true})
  for (const name of ['module-bindings.mts', 'module-bindings.mjs', 'reference-contracts.mts', 'reference-contracts.mjs', 'termination.mts', 'termination.mjs', 'completion.mts', 'completion.mjs'])
    await copyFile(resolve(root, 'tests/browser/session', name), resolve(directory, 'tests/browser/session', name))
  await mkdir(resolve(directory, 'tests/inputs'), {recursive: true})
  for (const name of ['text-files.mts', 'text-files.mjs', 'file-paths.mts', 'file-paths.mjs']) {
    await copyFile(resolve(root, 'tests/inputs', name), resolve(directory, 'tests/inputs', name))
  }
  await mkdir(resolve(directory, 'tests/reference/runtime'), {recursive: true})
  for (const name of ['input-ownership.mts', 'input-ownership.mjs', 'node-contract.mts', 'node-contract.mjs']) {
    await copyFile(resolve(root, 'tests/reference/runtime', name), resolve(directory, 'tests/reference/runtime', name))
  }
  await mkdir(resolve(directory, 'tests/package'), {recursive: true})
  for (const name of ['source.mts', 'source.mjs', 'native-inputs.mts', 'native-inputs.mjs', 'consumers.mts', 'consumers.mjs', 'receipts.mts', 'receipts.mjs'])
    await copyFile(resolve(root, 'tests/package', name), resolve(directory, 'tests/package', name))
  await mkdir(resolve(directory, 'tests/ci'), {recursive: true})
  for (const name of ['selection.mts', 'selection.mjs', 'verify-coverage.mts', 'verify-coverage.mjs', 'coverage.mts', 'coverage.mjs', 'browser-bindings.mts', 'browser-bindings.mjs']) {
    await copyFile(resolve(root, 'tests/ci', name), resolve(directory, 'tests/ci', name))
  }
  await mkdir(resolve(directory, 'examples/submission'), {recursive: true})
  for (const name of ['editor.mts', 'editor.js']) {
    await copyFile(resolve(root, 'examples/submission', name), resolve(directory, 'examples/submission', name))
  }
  const browserOutput = resolve(directory, 'tests/browser/upstream-defects.mjs')
  await writeFile(browserOutput, 'stale\n')
  const output = resolve(directory, 'scripts/parity.mjs')
  const generator = resolve(directory, 'scripts/generate-runtime-entries.mts')
  await writeFile(output, 'stale\n')
  const admission = resolve(directory, 'scripts/ci/require-jobs.mjs')
  await writeFile(admission, 'stale\n')
  const run = (mode: string, selection?: string) => spawnSync(process.execPath, ['--import', 'tsx', generator, mode, ...(selection === undefined ? [] : [selection])], {cwd: root, encoding: 'utf8'})
  assert.notEqual(run('--check').status, 0)
  const admissionWrite = run('--write', 'admission')
  assert.equal(admissionWrite.status, 0, admissionWrite.stderr)
  assert.equal(await readFile(admission, 'utf8'), await readFile(resolve(root, 'scripts/ci/require-jobs.mjs'), 'utf8'))
  assert.equal(await readFile(output, 'utf8'), 'stale\n')
  assert.notEqual(run('--check').status, 0)
  const generated = run('--write')
  assert.equal(generated.status, 0, generated.stderr)
  assert.equal(await readFile(output, 'utf8'), await readFile(resolve(root, 'scripts/parity.mjs'), 'utf8'))
  assert.equal(await readFile(resolve(directory, 'scripts/reference/capture-profile-literal-targets.mjs'), 'utf8'),
    await readFile(resolve(root, 'scripts/reference/capture-profile-literal-targets.mjs'), 'utf8'))
  assert.equal(await readFile(browserOutput, 'utf8'), await readFile(resolve(root, 'tests/browser/upstream-defects.mjs'), 'utf8'))
  assert.match(await readFile(browserOutput, 'utf8'), /^\/\/ Generated from tests\/browser\/upstream-defects\.mts/)
  const checked = run('--check')
  assert.equal(checked.status, 0, checked.stderr)
  await writeFile(browserOutput, 'stale\n')
  assert.notEqual(run('--check').status, 0, 'A stale browser entry must fail generation verification')
  const restored = run('--write')
  assert.equal(restored.status, 0, restored.stderr)
  const rechecked = run('--check')
  assert.equal(rechecked.status, 0, rechecked.stderr)
})

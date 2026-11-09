import assert from 'node:assert/strict'
import test from 'node:test'
import {spawnSync} from 'node:child_process'
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const workflow = await readFile(new URL('../../.github/workflows/validation.yml', import.meta.url), 'utf8')
const job = workflow.match(/^  collection-source-node22:\n([\s\S]*?)(?=^  [a-z][a-z-]*:\n)/m)?.[1]
assert.ok(job, 'Missing dedicated source collection job')
const blocks = [...job.matchAll(/    - run: \|\n        node --input-type=module <<'JAVASCRIPT'\n([\s\S]*?)        JAVASCRIPT\n/g)]
assert.equal(blocks.length, 1, 'Expected one source collection receipt block')
const program = blocks[0][1].split('\n').map(line => line.slice(8)).join('\n')

async function fixture(t) {
  await mkdir(resolve(root, 'artifacts/work'), {recursive: true})
  const directory = await mkdtemp(resolve(root, 'artifacts/work/collection-receipts-'))
  t.after(() => rm(directory, {recursive: true, force: true}))
  await mkdir(resolve(directory, 'artifacts/reports'), {recursive: true})
  const binding = {distribution: 'source', node_version: '22.23.4',
    imported_module: pathToFileURL(resolve(directory, 'packages/validator/src/index.js')).href}
  const collection = {...binding, cases: 138, approved_differences: 41, input_limits: 0,
    outcomes: {valid: 96, invalid: 42, incomplete: 0}}
  const diagnostics = {...binding, cases: 15, approved_differences: 3,
    outcomes: {valid: 3, invalid: 12, incomplete: 0}}
  return async (changeCollection = {}, changeDiagnostics = {}) => {
    await writeFile(resolve(directory, 'artifacts/reports/source-inferred-collections-node22.json'),
      JSON.stringify({...collection, ...changeCollection}))
    await writeFile(resolve(directory, 'artifacts/reports/source-collection-diagnostics-node22.json'),
      JSON.stringify({...diagnostics, ...changeDiagnostics}))
    return spawnSync(process.execPath, ['--input-type=module', '--eval', program],
      {cwd: directory, encoding: 'utf8', timeout: 10000, maxBuffer: 16384})
  }
}

function rejects(result, reason) {
  assert.ifError(result.error)
  assert.notEqual(result.status, 0, reason)
  assert.match(result.stderr, /AssertionError/, reason)
}

test('workflow receipt block admits the complete collection and diagnostic contracts', async t => {
  const run = await fixture(t), result = await run()
  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr)
})

test('workflow receipt block rejects partial collection coverage and unsupported limits', async t => {
  const run = await fixture(t)
  rejects(await run({cases: 125}), 'Missing registered cases')
  rejects(await run({input_limits: 3}), 'Unexpected input limits')
})

test('workflow receipt block requires collection outcomes and exact source ownership', async t => {
  const run = await fixture(t)
  for (const change of [
    {distribution: 'installed'}, {node_version: '24.3.0'}, {imported_module: 'file:///another/validator.js'},
    {approved_differences: 36}, {approved_differences: undefined}, {input_limits: undefined},
    {outcomes: {valid: 97, invalid: 41, incomplete: 0}},
    {outcomes: {valid: 96, invalid: 41, incomplete: 1}}, {outcomes: undefined},
  ]) rejects(await run(change), JSON.stringify(change))
})

test('workflow receipt block retains diagnostic counts, outcomes and source ownership', async t => {
  const run = await fixture(t)
  for (const change of [
    {distribution: 'installed'}, {node_version: '24.3.0'}, {imported_module: 'file:///another/validator.js'},
    {cases: 14}, {approved_differences: 2},
    {outcomes: {valid: 4, invalid: 11, incomplete: 0}}, {outcomes: undefined},
  ]) rejects(await run({}, change), JSON.stringify(change))
})

import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import test from 'node:test'
import {fileURLToPath, pathToFileURL} from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))

test('reference runner normalizes numeric bytes and preserves supported native values', async t => {
  const parent = resolve(root, 'artifacts/work')
  await mkdir(parent, {recursive: true})
  const directory = await mkdtemp(resolve(parent, 'reference-node-contract-'))
  t.after(() => rm(directory, {recursive: true, force: true}))
  const validator = resolve(directory, 'validator.mjs')
  await writeFile(validator, `
import assert from 'node:assert/strict'
export async function validateCrate(files, options) {
  assert.deepEqual([...files.get('bytes')], [0, 255])
  assert.ok(files.get('bytes') instanceof Uint8Array)
  assert.ok(files.get('buffer') instanceof ArrayBuffer)
  assert.ok(files.get('blob') instanceof Blob)
  assert.equal(options.contexts.get('urn:context'), 'local')
  return {status: 'incomplete', reason: 'test reason', stage: 'input', report: {issues: {ERROR: []}}}
}
`)
  const runner = new URL('../reference/runtime/node-contract.mjs', import.meta.url).href
  const code = `
import assert from 'node:assert/strict'
import {runNodeContracts} from ${JSON.stringify(runner)}
const report = await runNodeContracts({
  cases: [{name: 'mixed', files: {bytes: [0, 255], buffer: new ArrayBuffer(2), blob: new Blob(['x'])}, contexts: {'urn:context': 'local'}}],
  reference: {reference: 'commit', suite_sha256: 'digest'}, approvedDifferences: new Set(),
  assertResult(item, result) { assert.equal(item.name, 'mixed'); assert.equal(result.reason, 'test reason'); assert.equal(result.stage, 'input'); assert.deepEqual(result.report.issues.ERROR, []) },
})
assert.deepEqual(report.outcomes, {valid: 0, invalid: 0, incomplete: 1})
`
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', code], {
    cwd: root, env: {...process.env, BIJUX_VALIDATOR_MODULE: pathToFileURL(validator).href}, encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).cases, 1)
})

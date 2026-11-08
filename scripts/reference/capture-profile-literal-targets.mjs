import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {normalizeReport, normalizeText} from '../../tests/parity/normalize.mjs'
import {assertInputBytes} from '../../tests/parity/inputs.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const directory = resolve(root, 'tests/reference/profile-literal-targets')
const {cases} = JSON.parse(await readFile(resolve(directory, 'inputs.json')))
const contract = JSON.parse(await readFile(resolve(directory, 'contract.json')))
const reference = JSON.parse(await readFile(resolve(root, 'docs/compatibility/reference.json')))
const argument = process.argv.indexOf('--output')
const output = argument >= 0 ? resolve(root, process.argv[argument + 1]) : resolve(directory, 'python.json')
await mkdir(resolve(root, 'artifacts/reports'), {recursive: true})
await mkdir(resolve(root, 'artifacts/logs'), {recursive: true})
const result = spawnSync(process.env.BIA_PYTHON ?? resolve(root, 'artifacts/reference/python-env/bin/python'),
  [resolve(root, 'tests/parity/oracle.py')], {cwd: root, encoding: 'utf8', timeout: 600000,
    maxBuffer: 16 * 1024 * 1024, input: JSON.stringify({cases}),
    env: {...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONHASHSEED: '0'}})
await writeFile(resolve(root, 'artifacts/logs/profile-literal-reference.log'), result.stderr ?? '')
assert.equal(result.status, 0, result.stderr ?? String(result.error))
const oracle = JSON.parse(result.stdout)
await writeFile(resolve(root, 'artifacts/reports/profile-literal-reference-raw.json'), result.stdout)
assert.equal(oracle.commit, reference.commit)
assert.equal(oracle.corpus_sha256, createHash('sha256').update(JSON.stringify(cases)).digest('hex'))
assert.equal(oracle.cases.length, cases.length)
const targets = new Set(contract.dataset_targets), failOpen = new Set(contract.reference_fail_open)
for (const item of cases) {
  const row = oracle.cases.find(candidate => candidate.name === item.name)
  assert.ok(row)
  assertInputBytes(item, row)
  assert.equal(row.status, targets.has(item.name) && !failOpen.has(item.name) ? 'invalid' : 'valid', item.name)
}
const portable = {reference: oracle.commit, reference_tree: reference.tree, python: oracle.python,
  versions: oracle.versions, context_sha256: oracle.context_sha256, suite_sha256: oracle.corpus_sha256,
  cases: oracle.cases.map(row => ({...row, root: '', root_uri: '',
    report: normalizeReport(row.report, row.root, row.root_uri),
    exception: JSON.parse(JSON.stringify(row.exception), (_key, value) =>
      typeof value === 'string' ? normalizeText(value, row.root, row.root_uri) : value)}))}
await writeFile(output, JSON.stringify(portable, null, 2) + '\n')
console.log(JSON.stringify({reference: oracle.commit, policy_cases: cases.length,
  reference_disagreements: failOpen.size, suite_sha256: oracle.corpus_sha256}))

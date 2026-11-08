import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {createHash} from 'node:crypto'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {normalizeReport, normalizeText} from '../../tests/parity/normalize.mjs'
import {assertInputBytes} from '../../tests/parity/inputs.mjs'
import {capturePartitions} from './oracle-partitions.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const directory = resolve(root, 'tests/reference/profile-literal-targets')
const {cases} = JSON.parse(await readFile(resolve(directory, 'inputs.json')))
const contract = JSON.parse(await readFile(resolve(directory, 'contract.json')))
const reference = JSON.parse(await readFile(resolve(root, 'docs/compatibility/reference.json')))
let output = resolve(directory, 'python.json'), jobs = 1
const seen = new Set()
for (let index = 2; index < process.argv.length; index += 2) {
  const flag = process.argv[index], value = process.argv[index + 1]
  assert.ok(['--output', '--jobs'].includes(flag) && value && !value.startsWith('--') && !seen.has(flag), 'Use --output path and/or --jobs 1|2 once')
  seen.add(flag)
  if (flag === '--output') output = resolve(root, value)
  else {assert.ok(value === '1' || value === '2', 'Oracle jobs must be 1 or 2'); jobs = Number(value)}
}
await mkdir(resolve(root, 'artifacts/reports'), {recursive: true})
await mkdir(resolve(root, 'artifacts/logs'), {recursive: true})
const locked = Object.fromEntries((await readFile(resolve(root, 'tests/parity/requirements-oracle.txt'), 'utf8'))
  .split('\n').filter(line => line.includes('==')).map(line => line.split('==')))
const metadata = {python: reference.python,
  context_sha256: createHash('sha256').update(await readFile(resolve(root, 'tests/parity/context.json'))).digest('hex'),
  versions: Object.fromEntries(['pandas', 'pydantic', 'pyld', 'rdflib', 'roc-validator'].map(name => [name, locked[name]]))}
const logs = []
async function run(items, index) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.env.BIA_PYTHON ?? resolve(root, 'artifacts/reference/python-env/bin/python'),
      [resolve(root, 'tests/parity/oracle.py')], {cwd: root,
        env: {...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONHASHSEED: '0'}})
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    let stdout = '', stderr = '', size = 0, stderrSize = 0, failure
    const timer = setTimeout(() => {failure = new Error('Oracle capture exceeded 300000 ms'); child.kill('SIGKILL')}, 300000)
    child.on('error', error => {failure = error})
    child.stdin.on('error', error => {failure ??= error})
    child.stdout.on('data', data => {
      size += Buffer.byteLength(data)
      if (size > 16 * 1024 * 1024) {failure = new Error('Oracle stdout exceeded 16 MiB'); child.kill('SIGKILL')}
      else stdout += data
    })
    child.stderr.on('data', data => {
      stderrSize += Buffer.byteLength(data)
      if (stderrSize > 16 * 1024 * 1024) {failure = new Error('Oracle stderr exceeded 16 MiB'); child.kill('SIGKILL')}
      else stderr += data
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      logs[index] = stderr
      if (failure || code !== 0) return reject(failure ?? new Error(`Oracle failed: ${signal ?? code}\n${stderr}`))
      try {resolveResult(JSON.parse(stdout))} catch (error) {reject(error)}
    })
    child.stdin.end(JSON.stringify({cases: items}))
  })
}
let oracle
try {oracle = await capturePartitions({cases, jobs, reference, metadata, run})}
finally {await writeFile(resolve(root, 'artifacts/logs/profile-literal-reference.log'), logs.join(''))}
// Source version metadata is bound to the same pinned pyproject bytes, without
// taking validation outcomes or metadata from an earlier expected capture.
const pyproject = await readFile(resolve(dirname(oracle.imported_module), '../../pyproject.toml'))
assert.equal(createHash('sha256').update(pyproject).digest('hex'), reference.inputs['pyproject.toml'])
const section = /\[(?:project|tool\.poetry)\]([\s\S]*?)(?=^\[|$(?![\s\S]))/m.exec(pyproject.toString('utf8'))
const version = section && /^version\s*=\s*["']([^"']+)["']/m.exec(section[1])
assert.ok(version, 'Pinned source package version is missing')
assert.equal(oracle.versions['bia-ro-crate-validator'], version[1], 'Oracle source package version differs')
await writeFile(resolve(root, 'artifacts/reports/profile-literal-reference-raw.json'), JSON.stringify(oracle) + '\n')
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

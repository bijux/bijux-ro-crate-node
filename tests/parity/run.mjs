import assert from 'node:assert/strict'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {makeCases} from './cases.mjs'
import {compareResult} from './compare.mjs'
import {portableCase} from './normalize.mjs'
import {assertInputBytes} from './inputs.mjs'

const root = new URL('../../', import.meta.url)
const args = new Set(process.argv.slice(2))
const reference = JSON.parse(await readFile(new URL('docs/compatibility/reference.json', root), 'utf8'))
const cases = await makeCases()
assert.equal(new Set(cases.map(item => item.name)).size, cases.length, 'Duplicate corpus identity')
const hash = createHash('sha256').update(JSON.stringify(cases)).digest('hex')
const snapshot = new URL('./expected/crates.json', import.meta.url)
await mkdir(new URL('artifacts/reports/', root), {recursive: true})
let oracle
if (args.has('--snapshot')) oracle = JSON.parse(await readFile(snapshot, 'utf8'))
else {
  const python = process.env.BIA_PYTHON ?? fileURLToPath(new URL('artifacts/reference/python-env/bin/python', root))
  const output = await new Promise((resolve, reject) => {
    const child = spawn(python, [fileURLToPath(new URL('./oracle.py', import.meta.url))], {
      cwd: fileURLToPath(root), env: {...process.env, PYTHONHASHSEED: '0', PYTHONDONTWRITEBYTECODE: '1'},
      timeout: 600000,
    })
    let stdout = '', stderr = ''
    child.stdout.on('data', data => {stdout += data})
    child.stderr.on('data', data => {stderr += data})
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(`Oracle failed ${code}: ${stderr}`)))
    child.stdin.end(JSON.stringify({cases}))
  })
  oracle = JSON.parse(output)
  assert.equal(oracle.corpus_sha256, hash, 'Independent oracle input digest differs')
  await writeFile(new URL('artifacts/reports/oracle-raw.json', root), JSON.stringify(oracle, null, 2) + '\n')
  if (args.has('--record')) {
    // Import paths identify this execution in the raw receipt; a portable
    // checked-in snapshot must not carry the capturing machine's path.
    const {imported_module: _importedModule, ...snapshotOracle} = oracle
    const stable = {...snapshotOracle, cases: oracle.cases.map(portableCase)}
    await writeFile(snapshot, JSON.stringify(stable, null, 2) + '\n')
  }
}
assert.equal(oracle.commit, reference.commit, 'Oracle source mismatch')
assert.equal(oracle.corpus_sha256, hash, 'Oracle corpus mismatch')
assert.equal(oracle.cases.length, cases.length, 'Oracle omitted required cases')
if (args.has('--oracle-only')) {
  console.log(JSON.stringify({commit: oracle.commit, cases: cases.length, corpus_sha256: hash, versions: oracle.versions}, null, 2))
  process.exit(0)
}
const module = process.env.BIJUX_VALIDATOR_MODULE ?? '../../packages/validator/src/index.js'
const importedModule = new URL(module, import.meta.url).href
const {validateCrate} = await import(importedModule)
const expected = new Map(oracle.cases.map(item => [item.name, item]))
assert.equal(expected.size, cases.length)
const failures = []
for (const item of cases) {
  const wanted = expected.get(item.name)
  assert.ok(wanted, `Missing case: ${item.name}`)
  assertInputBytes(item, wanted)
  const actual = await validateCrate(new Map(Object.entries(item.files).map(([name, value]) =>
    [name, Array.isArray(value) ? new Uint8Array(value) : value])),
  {contexts: new Map(Object.entries(item.contexts ?? {}))})
  try {
    compareResult(actual, wanted, item.name)
  } catch (error) {failures.push({name: item.name, message: error.message, expected: wanted, actual})}
}
const distribution = process.env.BIJUX_VALIDATOR_MODULE ? 'installed' : 'source'
const report = {distribution, imported_module: importedModule, node_version: process.versions.node, reference: reference.commit, corpus_sha256: hash, mode: args.has('--snapshot') ? 'snapshot' : 'live',
  total: cases.length, passed: cases.length - failures.length, failed: failures.length, failures}
await writeFile(new URL(`artifacts/reports/${distribution}-${report.mode}-parity.json`, root), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({...report, failures: failures.map(item => ({name: item.name, message: item.message}))}, null, 2))
if (failures.length) process.exitCode = 1

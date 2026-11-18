import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {portableCase} from '../../parity/normalize.mjs'
import {assertInputBytes, type OracleInput, type OracleInputReceipt} from '../../parity/inputs.mjs'
import type {PortableCapture} from '../../parity/normalize.mjs'
type Capture = {imported_module?: unknown; corpus_sha256: unknown; cases: Array<PortableCapture & OracleInputReceipt>; [key: string]: unknown}
const [path, ...extra] = process.argv.slice(2)
assert.ok(path && !extra.length, 'Expected a fresh XML name capture path')
const {cases} = JSON.parse(await readFile(new URL('inputs.json', import.meta.url), 'utf8')) as {cases: OracleInput[]}
const expected = JSON.parse(await readFile(new URL('python.json', import.meta.url), 'utf8')) as unknown
const raw = JSON.parse(await readFile(path, 'utf8')) as Capture
assert.equal(raw.corpus_sha256, createHash('sha256').update(JSON.stringify(cases)).digest('hex'))
for (const item of cases) assertInputBytes(item, raw.cases.find(row => row.name === item.name)!)
const {imported_module: _module, ...portable} = raw
portable.cases = raw.cases.map(portableCase)
assert.deepEqual(portable, expected)
console.log(cases.length + ' original XML name/counterpart captures verified')

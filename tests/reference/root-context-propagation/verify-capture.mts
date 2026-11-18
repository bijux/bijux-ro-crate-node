import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {portableCase} from '../../parity/normalize.mjs'
import {assertInputBytes, type OracleInput, type OracleInputReceipt} from '../../parity/inputs.mjs'
import type {PortableCapture} from '../../parity/normalize.mjs'
type Capture = {imported_module?: unknown; cases: Array<PortableCapture & OracleInputReceipt>; [key: string]: unknown}
const [path, ...extra] = process.argv.slice(2)
assert.ok(path && !extra.length, 'Expected one original Python capture path')
const input = JSON.parse(await readFile(new URL('inputs.json', import.meta.url), 'utf8')) as {cases: OracleInput[]}
const expected = JSON.parse(await readFile(new URL('python.json', import.meta.url), 'utf8')) as unknown
const {imported_module: _module, ...raw} = JSON.parse(await readFile(path, 'utf8')) as Capture
assert.deepEqual(raw.cases.map(row => row.name), input.cases.map(item => item.name))
for (const item of input.cases) assertInputBytes(item, raw.cases.find(row => row.name === item.name)!)
assert.deepEqual({...raw, cases: raw.cases.map(portableCase)}, expected)
console.log(input.cases.length + ' original root-context captures verified')

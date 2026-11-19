import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {portableCase} from '../../parity/normalize.mjs'
import {assertInputBytes, type OracleInputReceipt} from '../../parity/inputs.mjs'
import type {PortableCapture} from '../../parity/normalize.mjs'
type Raw = {imported_module: string; cases: Array<PortableCapture & OracleInputReceipt>; [key: string]: unknown}
import {cases} from './checks.mjs'
const [path, ...extra] = process.argv.slice(2)
assert.ok(path && !extra.length, 'Expected one fresh URL authority capture')
const expected = JSON.parse(await readFile(new URL('python.json', import.meta.url), 'utf8')) as unknown
const {imported_module: _module, ...raw} = JSON.parse(await readFile(path, 'utf8')) as Raw
for (const [index, item] of cases.entries()) assertInputBytes(item, raw.cases[index])
assert.deepEqual({...raw, cases: raw.cases.map(portableCase)}, expected)
console.log(cases.length + ' unchanged Python URL authority records verified')

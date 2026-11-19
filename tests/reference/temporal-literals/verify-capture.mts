import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {portableCase} from '../../parity/normalize.mjs'
import {assertInputBytes, type OracleInputReceipt} from '../../parity/inputs.mjs'
import {cases} from './checks.mjs'
import type {PortableCapture} from '../../parity/normalize.mjs'
type Raw = {imported_module: string; cases: Array<PortableCapture & OracleInputReceipt>; [key: string]: unknown}

const [originalPath, correctedPath, ...extra] = process.argv.slice(2)
assert.ok(originalPath && correctedPath && !extra.length, 'Expected untouched and corrected temporal captures')
for (const [name, path] of [['original', originalPath], ['corrected', correctedPath]] as const) {
  const expected = JSON.parse(await readFile(new URL(name + '.json', import.meta.url), 'utf8')) as unknown
  const {imported_module: _module, ...raw} = JSON.parse(await readFile(path, 'utf8')) as Raw
  assert.equal(raw.cases.length, cases.length)
  for (const [index, item] of cases.entries()) assertInputBytes(item, raw.cases[index])
  assert.deepEqual({...raw, cases: raw.cases.map(portableCase)}, expected)
}
console.log(cases.length + ' untouched and independently corrected temporal records verified')

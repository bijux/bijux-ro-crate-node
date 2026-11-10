import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {portableCase} from '../../parity/normalize.mjs'
import {assertInputBytes} from '../../parity/inputs.mjs'
import {cases} from './checks.mjs'

const [originalPath, correctedPath, ...extra] = process.argv.slice(2)
assert.ok(originalPath && correctedPath && !extra.length, 'Expected untouched and corrected graph captures')
for (const [mode, path] of [['original', originalPath], ['corrected', correctedPath]]) {
  const expected = JSON.parse(await readFile(new URL(mode + '.json', import.meta.url)))
  const {imported_module: _module, ...raw} = JSON.parse(await readFile(path))
  assert.equal(raw.cases.length, cases.length)
  cases.forEach((item, index) => assertInputBytes(item, raw.cases[index]))
  assert.deepEqual({...raw, cases: raw.cases.map(portableCase)}, expected)
}
console.log(cases.length + ' untouched and independently corrected graph-context captures verified')

import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {portableCase} from '../../parity/normalize.mjs'
import {assertInputBytes} from '../../parity/inputs.mjs'

const [kind, path, ...extra] = process.argv.slice(2)
assert.ok(['original', 'corrected'].includes(kind) && path && !extra.length,
  'Expected original|corrected and one fresh Python capture')
const input = JSON.parse(await readFile(new URL('inputs.json', import.meta.url)))
const expected = JSON.parse(await readFile(new URL(kind + '.json', import.meta.url)))
const {imported_module, ...raw} = JSON.parse(await readFile(path))
assert.ok(imported_module.endsWith('/src/bia_ro_crate/__init__.py'))
assert.deepEqual(raw.cases.map(row => row.name), input.cases.map(item => item.name))
for (const item of input.cases) assertInputBytes(item, raw.cases.find(row => row.name === item.name))
assert.deepEqual({...raw, cases: raw.cases.map(portableCase)}, expected)
console.log('Verified ' + raw.cases.length + ' complete ' + kind + ' key captures')

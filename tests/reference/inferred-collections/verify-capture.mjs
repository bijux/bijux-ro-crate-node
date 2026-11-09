import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {portableCase} from '../../parity/normalize.mjs'
import {assertInputBytes} from '../../parity/inputs.mjs'
import {assertCaptureRecord} from './capture-records.mjs'

const [mode, path, ...extra] = process.argv.slice(2)
assert.ok(['original', 'corrected'].includes(mode) && path && !extra.length,
  'Expected original/corrected and a fresh Python capture')
const all = JSON.parse(await readFile(new URL('./inputs.json', import.meta.url))).cases
const limits = JSON.parse(await readFile(new URL('./limits.json', import.meta.url)))
const cases = mode === 'corrected' ? all.filter(item => !Object.hasOwn(limits, item.name)) : all
const expected = JSON.parse(await readFile(new URL('./' + mode + '.json', import.meta.url)))
const raw = JSON.parse(await readFile(path))
assert.equal(raw.corpus_sha256, createHash('sha256').update(JSON.stringify(cases)).digest('hex'))
assert.deepEqual(raw.cases.map(row => row.name), cases.map(item => item.name))
for (const item of cases) assertInputBytes(item, raw.cases.find(row => row.name === item.name))
const {imported_module: _module, ...portable} = raw
portable.cases = raw.cases.map(portableCase)
assert.deepEqual({...portable, cases: []}, {...expected, cases: []})
for (const [index, row] of portable.cases.entries()) assertCaptureRecord(row, expected.cases[index])
console.log(cases.length + ' ' + mode + ' collection captures verified')

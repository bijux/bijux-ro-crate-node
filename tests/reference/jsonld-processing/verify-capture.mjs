import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {portableCapture} from './portable.mjs'
import {assertInputBytes} from '../../parity/inputs.mjs'
const [mode, path, ...extra] = process.argv.slice(2)
assert.ok(['original', 'corrected', 'counterparts'].includes(mode) && path && !extra.length)
const inputName = mode === 'counterparts' ? 'propagation-counterparts.json' : 'inputs.json'
let {cases} = JSON.parse(await readFile(new URL(inputName, import.meta.url)))
if (mode === 'corrected') cases = cases.filter(item => !item.name.startsWith('jsonld-context/remote-local/'))
const raw = JSON.parse(await readFile(path))
assert.equal(raw.corpus_sha256, createHash('sha256').update(JSON.stringify(cases)).digest('hex'))
assert.deepEqual(raw.cases.map(item => item.name), cases.map(item => item.name))
assert.equal(new Set(raw.cases.map(item => item.name)).size, cases.length)
cases.forEach((item, index) => assertInputBytes(item, raw.cases[index]))
assert.deepEqual(portableCapture(raw), JSON.parse(await readFile(new URL(mode + '.json', import.meta.url))))
console.log(mode + ': ' + cases.length + ' complete JSON-LD reference captures verified')

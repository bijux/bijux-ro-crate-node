import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {portableCapture} from './portable.mjs'
import {assertInputBytes, type OracleInput, type OracleInputReceipt} from '../../parity/inputs.mjs'
import type {PortableCapture} from '../../parity/normalize.mjs'
type Raw = {corpus_sha256: string; cases: Array<PortableCapture & OracleInputReceipt & {name: string}>; reference_paths?: {pyld_module?: unknown} | null}
const [mode, path, ...extra] = process.argv.slice(2)
assert.ok(mode && ['original', 'corrected', 'counterparts'].includes(mode) && path && !extra.length)
const inputName = mode === 'counterparts' ? 'propagation-counterparts.json' : 'inputs.json'
let {cases} = JSON.parse(await readFile(new URL(inputName, import.meta.url), 'utf8')) as {cases: OracleInput[]}
if (mode === 'corrected') cases = cases.filter(item => !item.name.startsWith('jsonld-context/remote-local/'))
const raw = JSON.parse(await readFile(path, 'utf8')) as Raw
assert.equal(raw.corpus_sha256, createHash('sha256').update(JSON.stringify(cases)).digest('hex'))
assert.deepEqual(raw.cases.map(item => item.name), cases.map(item => item.name))
assert.equal(new Set(raw.cases.map(item => item.name)).size, cases.length)
cases.forEach((item, index) => assertInputBytes(item, raw.cases[index]))
assert.deepEqual(portableCapture(raw), JSON.parse(await readFile(new URL(mode + '.json', import.meta.url), 'utf8')) as unknown)
console.log(mode + ': ' + cases.length + ' complete JSON-LD reference captures verified')

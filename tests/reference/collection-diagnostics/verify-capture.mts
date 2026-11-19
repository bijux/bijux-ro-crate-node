import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {portableCase} from '../../parity/normalize.mjs'
import {assertCaptureBounds, type Capture} from './checks.mjs'
import type {PortableCapture} from '../../parity/normalize.mjs'

const [mode, path, ...extra] = process.argv.slice(2)
assert.ok(['original', 'corrected', 'ordinary'].includes(mode) && path && !extra.length)
const raw = JSON.parse(await readFile(path, 'utf8')) as Capture & {imported_module: string; cases: Array<Capture['cases'][number] & PortableCapture>}
const {imported_module: _module, ...capture} = raw
const portable = {...capture, cases: raw.cases.map(portableCase)}
const read = async (name: string): Promise<Capture> => JSON.parse(await readFile(new URL(name, import.meta.url), 'utf8'))
if (mode !== 'corrected') assert.deepEqual(portable, await read(mode === 'ordinary' ? './ordinary-reference.json' : './original.json'))
// The registered capture schema supplies the diagnostic fields preserved by normalization.
else assertCaptureBounds(await read('./original.json'), portable as Capture)
console.log(portable.cases.length + ' exact ' + mode + ' diagnostic captures verified')

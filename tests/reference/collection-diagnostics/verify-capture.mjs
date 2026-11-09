import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {portableCase} from '../../parity/normalize.mjs'
import {assertCaptureBounds} from './checks.mjs'

const [mode, path, ...extra] = process.argv.slice(2)
assert.ok(['original', 'corrected', 'ordinary'].includes(mode) && path && !extra.length)
const raw = JSON.parse(await readFile(path))
const {imported_module: _module, ...portable} = raw
portable.cases = raw.cases.map(portableCase)
const read = async name => JSON.parse(await readFile(new URL(name, import.meta.url)))
if (mode !== 'corrected') assert.deepEqual(portable, await read(mode === 'ordinary' ? './ordinary-reference.json' : './original.json'))
else assertCaptureBounds(await read('./original.json'), portable)
console.log(portable.cases.length + ' exact ' + mode + ' diagnostic captures verified')

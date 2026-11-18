import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {portableCase, type PortableCapture} from '../../parity/normalize.mjs'
import type {OracleInputReceipt} from '../../parity/inputs.mjs'
import {assertCapture} from './checks.mjs'
const[mode,path,...extra]=process.argv.slice(2)
assert.ok(mode==='original'&&path&&!extra.length)
const{imported_module:_module,...raw}=JSON.parse(await readFile(path, 'utf8')) as {imported_module?: unknown; cases: Array<PortableCapture & OracleInputReceipt>; [key: string]: unknown}
raw.cases=raw.cases.map(portableCase)
assertCapture(raw,mode)
console.log('Twenty exact '+mode+' model-type prefix records verified')

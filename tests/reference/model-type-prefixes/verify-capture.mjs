import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {portableCase} from '../../parity/normalize.mjs'
import {assertCapture} from './checks.mjs'
const[mode,path,...extra]=process.argv.slice(2)
assert.ok(['original','corrected'].includes(mode)&&path&&!extra.length)
const{imported_module:_module,...raw}=JSON.parse(await readFile(path))
raw.cases=raw.cases.map(portableCase)
assertCapture(raw,mode)
console.log('Twenty exact '+mode+' model-type prefix records verified')

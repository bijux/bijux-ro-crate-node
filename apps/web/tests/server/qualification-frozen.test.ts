import {test} from 'node:test'
import assert from 'node:assert/strict'
import {decodeFrozenSelection} from '../../src/server/qualification/frozen.js'

const payload = JSON.stringify({version:1, creator:{}, pending:[]})
const file = {path:'ro-crate-metadata.json', base64:Buffer.from('metadata').toString('base64')}
test('selects original admitted bytes from read-only or materialized versions', () => {
  for (const status of ['read-only', 'materialized']) {
    const result = decodeFrozenSelection(payload, {status, files:[file]})
    assert.equal(result.status, 'selected')
    if (result.status === 'selected') assert.deepEqual(result.files.get(file.path), Buffer.from('metadata'))
  }
})
test('rejects pending work, blocked versions and malformed or unsafe frozen data', () => {
  for (const [saved, frozen] of [
    [JSON.stringify({version:1,creator:{},pending:[{}]}), {status:'read-only',files:[file]}],
    [payload, {status:'blocked'}], [payload, {status:'read-only',files:[{path:'../escape',base64:'eA=='}]}],
    [payload, {status:'read-only',files:[{path:'a',base64:'eA'}]}],
    [payload, {status:'read-only',files:[file,file]}], [payload, {status:'read-only',files:[{path:'a',base64:'!'}]}],
  ] as const) assert.equal(decodeFrozenSelection(saved, frozen).status, 'incomplete')
})

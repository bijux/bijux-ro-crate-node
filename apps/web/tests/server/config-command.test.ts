import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {test} from 'node:test'
import {fileURLToPath} from 'node:url'

const entry = fileURLToPath(new URL('../../config-check.mts', import.meta.url))
test('configuration check validates without connecting or exposing values', () => {
  for (const settings of [{BSS_MODE:'standalone'}, {BSS_MODE:'local', BSS_API_BASE_URL:'http://127.0.0.1:8000/api'}, {BSS_MODE:'connected', BSS_API_BASE_URL:'https://example.invalid/api'}]) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', entry], {env:{...process.env, ...settings}, encoding:'utf8'})
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /Environment files, connectivity and credentials were not checked/)
  }
  const secret = 'private-config-value'
  const result = spawnSync(process.execPath, ['--import', 'tsx', entry], {env:{...process.env, BSS_MODE:'local', BSS_API_BASE_URL:`http://user:${secret}@example.invalid/api`}, encoding:'utf8'})
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Invalid BSS configuration/)
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(secret))
})

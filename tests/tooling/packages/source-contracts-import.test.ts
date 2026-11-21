import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import test from 'node:test'

test('source qualification contracts import without loading corpus or querying Git', () => {
  const script = `import fs from 'node:fs'; import child from 'node:child_process';
    fs.promises.readFile = () => { throw new Error('unexpected file read') };
    child.execFileSync = () => { throw new Error('unexpected child process') };
    await import('./tests/package/source-contracts.mjs');
    await import('./tests/package/source.mjs');`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {encoding: 'utf8'})
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, '')
})

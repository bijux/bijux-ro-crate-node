import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import test from 'node:test'

test('consumer planning and command imports do not start preparation', () => {
  const source = `import fs from 'node:fs';
    const read = fs.promises.readFile;
    fs.promises.readFile = function(path, ...args) {
      if (String(path).endsWith('/artifacts/packages/manifest.json')) throw new Error('unexpected manifest read');
      return read.call(this, path, ...args);
    };
    const {planConsumers} = await import('./tests/package/harness/plan.mjs');
    await import('./tests/package/consumers.mjs');
    if (planConsumers([], new Map()).length !== 0) process.exit(3);`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {encoding: 'utf8'})
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, '')
})

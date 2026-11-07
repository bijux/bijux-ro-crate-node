import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { validateModel } from '../../packages/validator/src/metadata/models/validation.js';

const cases = JSON.parse(fs.readFileSync(new URL('../parity/expected/model-cases.json', import.meta.url)));
for (const item of cases) {
  test(item.name, () => {
    const actual = validateModel(item.input, item.uri);
    assert.deepEqual(actual.errors, item.expected.errors);
    if (!actual.errors.length) assert.deepEqual(actual.entity, item.expected.entity);
  });
}

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import type {ModelIssue} from '../../src/metadata/models/issues.js';
import { validateModel } from '../../src/metadata/models/validation.js';

interface ModelCase {name: string; uri: string; input: Record<string, unknown>; expected: {errors: ModelIssue[]; entity?: unknown}}
const cases: ModelCase[] = JSON.parse(fs.readFileSync(new URL('../../../../tests/parity/expected/model-cases.json', import.meta.url), 'utf8'));
for (const item of cases) {
  test(item.name, () => {
    const actual = validateModel(item.input, item.uri);
    assert.deepEqual(actual.errors, item.expected.errors);
    if (!actual.errors.length) assert.deepEqual(actual.entity, item.expected.entity);
  });
}

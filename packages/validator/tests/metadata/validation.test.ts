import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { validateMetadata } from '../../src/metadata/validation.js';
import type { ValidationIssue } from '@bijux/ro-crate-core';

const context: unknown = JSON.parse(fs.readFileSync(new URL('../../../../tests/parity/context.json', import.meta.url), 'utf8'));
const documentLoader = async (documentUrl: string) => ({ contextUrl: null, documentUrl, document: context });
const cases: {name: string; input: unknown; expected: {exception?: unknown; issues: ValidationIssue[]; entities?: unknown; modelTypes?: unknown}}[] = JSON.parse(fs.readFileSync(new URL('../../../../tests/parity/expected/metadata-cases.json', import.meta.url), 'utf8'));
// Python iterates RDF type sets in process-dependent order.
function canonicalIssues(issues: ValidationIssue[]) {
  return issues.map(issue => ({ ...issue, message: issue.message.replace(/(@type contains: )(.*?)(, matching)/, (_, prefix, values, suffix) => prefix + values.split(', ').sort().join(', ') + suffix) }));
}
for (const item of cases) {
  test(`JSON-LD metadata ${item.name}`, async () => {
    const issues: ValidationIssue[] = [];
    if (item.expected.exception) {
      await assert.rejects(validateMetadata(item.input, issues, { documentLoader }));
      return;
    }
    const actual = await validateMetadata(item.input, issues, { documentLoader });
    assert.deepEqual(canonicalIssues(issues), canonicalIssues(item.expected.issues));
    if (item.expected.entities) {
      assert.deepEqual(Object.fromEntries(actual.entities), item.expected.entities);
      assert.deepEqual(Object.fromEntries(actual.modelTypes), item.expected.modelTypes);
    }
  });
}

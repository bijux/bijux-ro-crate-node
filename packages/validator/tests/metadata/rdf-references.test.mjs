import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { checkReferences } from '../../src/metadata/rdf/references.js';

const cases = JSON.parse(fs.readFileSync(new URL('../../../../tests/parity/expected/reference-cases.json', import.meta.url)));
function canonicalIssues(issues) {
  return issues.map(issue => ({ ...issue, message: issue.message.replace(/^(Found undefined references: )(.*)$/, (_, prefix, values) => prefix + values.split(', ').sort().join(', ')) }));
}
for (const item of cases) {
  test(`RDF reference ${item.name}`, async () => {
    const issues = [];
    const dataset = await checkReferences(item.input, issues);
    assert.ok(Array.isArray(dataset));
    assert.deepEqual(canonicalIssues(issues), canonicalIssues(item.expected));
  });
}

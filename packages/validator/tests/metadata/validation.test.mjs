import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { validateMetadata } from '../../src/metadata/validation.js';

const context = JSON.parse(fs.readFileSync(new URL('../../../../tests/parity/context.json', import.meta.url)));
const documentLoader = async documentUrl => ({ contextUrl: null, documentUrl, document: context });
const cases = JSON.parse(fs.readFileSync(new URL('../../../../tests/parity/expected/metadata-cases.json', import.meta.url)));
// Python iterates RDF type sets in process-dependent order.
function canonicalIssues(issues) {
  return issues.map(issue => ({ ...issue, message: issue.message.replace(/(@type contains: )(.*?)(, matching)/, (_, prefix, values, suffix) => prefix + values.split(', ').sort().join(', ') + suffix) }));
}
for (const item of cases) {
  test(`JSON-LD metadata ${item.name}`, async () => {
    const issues = [];
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

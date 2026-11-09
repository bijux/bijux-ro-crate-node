import assert from 'node:assert/strict'
import test from 'node:test'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const families = [
  ['html-tree-building', 'correctedByName', 'assertResult', 'html-tree-building/ruby-implied-rb/collection'],
  ['xml-name-edition', 'expected', 'assertResult', 'xml-name-edition/greek-letter/collection'],
  ['blank-node-diagnostics', 'correctedByName', 'assertDiagnosticResult', 'inverse-path/self-referencing-blank-file', 'corrected'],
  ['disabled-context-terms', 'expectedByName', 'assertResult', 'context-term/unused-null-term', 'reference'],
  ['root-context-propagation', 'expected', 'assertResult', 'jsonld/propagate-false'],
  ['manifest-numeric-identity', 'python', 'assertNumericResult', 'numeric-identity/identical-path-control', 'original'],
  ['profile-literal-targets', 'python', 'assertPolicyResult', 'literal-value-focus/integer/invalid', 'reference'],
  ['upstream-defects', 'python', 'assertUpstreamResult', 'profile-converter-failures/decimal-valid-website-control'],
]

function isolated(source) {
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
    cwd: root, encoding: 'utf8', timeout: 20000,
  })
  assert.equal(result.status, 0, result.stderr || result.error?.message || result.stdout)
}

for (const [family, map, guard, name, capture] of families) {
  for (const mutation of ['map-entry', 'nested-report', ...(capture ? ['capture-record'] : [])])
    test(`${family} comparisons own their expectations after ${mutation} mutation`, () => isolated(`
      import assert from 'node:assert/strict';
      import * as family from './tests/reference/${family}/checks.mjs';
      const item = family.cases.find(row => row.name === ${JSON.stringify(name)});
      const expected = structuredClone(family[${JSON.stringify(map)}].get(item.name));
      const check = result => family[${JSON.stringify(guard)}](item, result);
      check(expected);
      const forged = structuredClone(expected);
      const unexpected = {message: 'Unregistered reference finding', severity: 20, location_description: null};
      forged.report.issues.INFO.push(unexpected);
      forged.report.highest_error_level ??= 'INFO';
      assert.throws(() => check(forged));
      if (${JSON.stringify(mutation)} === 'map-entry') family[${JSON.stringify(map)}].set(item.name, forged);
      else {
        const exposed = ${JSON.stringify(mutation)} === 'capture-record'
          ? family[${JSON.stringify(capture)}].cases.find(row => row.name === expected.name)
          : family[${JSON.stringify(map)}].get(item.name);
        exposed.report.issues.INFO.push(unexpected);
        exposed.report.highest_error_level ??= 'INFO';
      }
      assert.throws(() => check(forged));
      check(expected);
    `))
}

test('aggregate literal inspection records cannot mutate a child counterpart expectation', () => isolated(`
  import assert from 'node:assert/strict';
  import * as aggregate from './tests/reference/literal-grammar/checks.mjs';
  import * as xml from './tests/reference/xml-name-edition/checks.mjs';
  const item = aggregate.cases.find(row => row.name === 'xml-name-edition/greek-letter/collection');
  const expected = structuredClone(xml.expected.get(item.name));
  aggregate.assertResult(item, expected);
  const forged = structuredClone(expected);
  const unexpected = {message: 'Unregistered aggregate finding', severity: 20, location_description: null};
  forged.report.issues.INFO.push(unexpected);
  aggregate.originalByName.get(expected.name).report.issues.INFO.push(unexpected);
  assert.throws(() => aggregate.assertResult(item, forged));
  aggregate.assertResult(item, expected);
`))

test('numeric rounding policy does not follow its exported ambiguous Set', () => isolated(`
  import assert from 'node:assert/strict';
  import * as family from './tests/reference/manifest-numeric-identity/checks.mjs';
  const item = family.cases.find(row => family.ambiguous.has(row.name));
  const result = {status: 'incomplete', stage: 'file-list',
    reason: 'File list validation depends on platform-specific numeric rounding',
    report: {highest_error_level: null, issues: {CRITICAL: [], ERROR: [], WARNING: [], INFO: [], DEBUG: []}}};
  family.assertNumericResult(item, result);
  family.ambiguous.clear();
  family.assertNumericResult(item, result);
  assert.throws(() => family.assertNumericResult(item, family.python.get(item.name)));
`))

test('literal rejection owns its policy Sets and finding contract', () => isolated(`
  import assert from 'node:assert/strict';
  import * as family from './tests/reference/profile-literal-targets/checks.mjs';
  import {correctedConstraintReport} from './tests/reference/upstream-defects/constraint-report.mjs';
  const item = family.cases.find(row => family.failOpen.has(row.name));
  const original = structuredClone(family.python.get(item.name));
  const result = {...original, status: 'invalid',
    report: correctedConstraintReport(original, structuredClone(family.contract.corrected_findings[item.name]))};
  family.assertPolicyResult(item, result);
  family.datasetTargets.clear(); family.failOpen.clear();
  family.contract.corrected_findings[item.name].message = 'Unregistered finding';
  family.python.set(item.name, result);
  family.assertPolicyResult(item, result);
  assert.throws(() => family.assertPolicyResult(item, original));
`))

test('upstream converter rejection does not follow exported records or rejection Set', () => isolated(`
  import assert from 'node:assert/strict';
  import * as family from './tests/reference/upstream-defects/checks.mjs';
  import {correctedConstraintReport} from './tests/reference/upstream-defects/constraint-report.mjs';
  const item = family.cases.find(row => row.name.startsWith('profile-converter-failures/') && row.name.endsWith('unnamed-website'));
  const original = structuredClone(family.python.get(item.name));
  const result = {...original, status: 'invalid', report: correctedConstraintReport(original, {
    message: 'A WebSite MUST have a ' + String.fromCharCode(96) + 'name' + String.fromCharCode(96) + ' property',
    severity: 40, location_description: 'At ro-crate object with @id: ./#unnamed'})};
  family.assertUpstreamResult(item, result);
  family.rejected.clear(); family.python.set(item.name, result);
  family.assertUpstreamResult(item, result);
  assert.throws(() => family.assertUpstreamResult(item, original));
`))

for (const [family, map, guard, name] of families.filter(([family]) =>
  ['xml-name-edition', 'root-context-propagation', 'upstream-defects'].includes(family)))
  test(`${family} policy selection survives exported Set mutation`, () => isolated(`
    import assert from 'node:assert/strict';
    import * as family from './tests/reference/${family}/checks.mjs';
    const item = family.cases.find(row => row.name === ${JSON.stringify(name)});
    const expected = structuredClone(family[${JSON.stringify(map)}].get(item.name));
    for (const value of Object.values(family)) if (value instanceof Set) value.clear();
    family[${JSON.stringify(guard)}](item, expected);
    const changed = {...expected, status: expected.status === 'valid' ? 'invalid' : 'valid'};
    assert.throws(() => family[${JSON.stringify(guard)}](item, changed));
  `))

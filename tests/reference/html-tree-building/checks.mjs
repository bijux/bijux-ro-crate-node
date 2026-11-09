import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {assertInputBytes} from '../../parity/inputs.mjs';
import {compareResult} from '../../parity/compare.mjs';
const read = async name => JSON.parse(await readFile(new URL(name, import.meta.url)));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const {cases} = await read('inputs.json');
const {pairs} = await read('pairs.json');
const original = await read('original-python.json'), corrected = await read('corrected-python.json');
const pin = await read('../../../docs/compatibility/reference.json');
assert.equal(cases.length, 16); assert.equal(pairs.length, 8);
assert.equal(new Set(cases.map(item => item.name)).size, cases.length);
assert.equal(original.commit, pin.commit); assert.equal(corrected.commit, pin.commit);
assert.equal(original.python, pin.python); assert.deepEqual(original.versions, corrected.versions);
const suiteHash = hash(JSON.stringify(cases));
assert.equal(original.corpus_sha256, suiteHash); assert.equal(corrected.corpus_sha256, suiteHash);
assert.ok(!Object.hasOwn(original, 'html_grammar_correction'));
const stamp = corrected.html_grammar_correction;
for (const [key, file] of [['correction_sha256', 'corrected.py'], ['capture_sha256', 'capture.py'],
  ['oracle_sha256', '../../parity/oracle.py'], ['inputs_sha256', 'inputs.json']])
  assert.equal(stamp[key], hash(await readFile(new URL(file, import.meta.url))), key);
const capturedOriginal = new Map(original.cases.map(row => [row.name, row]));
const capturedCorrected = new Map(corrected.cases.map(row => [row.name, row]));
export const approvedDifferences = new Set(pairs.filter(pair => pair.reference_difference)
  .flatMap(pair => ['collection', 'hasvalue'].map(route => `html-tree-building/${pair.name}/${route}`)));
assert.equal(approvedDifferences.size, 10);
const fixtureShapes = new Map();
for (const item of cases) {
  const before = capturedOriginal.get(item.name), after = capturedCorrected.get(item.name);
  assert.ok(before && after); assertInputBytes(item, before); assertInputBytes(item, after);
  let differs = false;
  try {compareResult(after, before, item.name);} catch {differs = true;}
  assert.equal(differs, approvedDifferences.has(item.name), item.name);
  if (!differs) assert.deepEqual(after, before, 'Matching control changed: ' + item.name);
  const [, pairName, route] = item.name.split('/'), pair = pairs.find(candidate => candidate.name === pairName);
  assert.ok(pair && ['collection', 'hasvalue'].includes(route));
  const document = JSON.parse(item.files['ro-crate-metadata.json']);
  const subject = document['@graph'][2];
  const literals = route === 'collection' ? subject.first : [subject.tag, subject.hasValue];
  assert.deepEqual(literals, [pair.first, pair.second].map(value => ({'@value': value,
    '@type': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#HTML'})));
  literals.forEach((literal, index) => {literal['@value'] = ['first identity', 'second identity'][index];});
  const shape = {document, otherFiles: Object.fromEntries(Object.entries(item.files).filter(([name]) => name !== 'ro-crate-metadata.json'))};
  if (fixtureShapes.has(route)) assert.deepEqual(shape, fixtureShapes.get(route), 'Fixture roles changed');
  else fixtureShapes.set(route, shape);
}
export const rejected = new Set(cases.filter(item => capturedCorrected.get(item.name).status === 'invalid').map(item => item.name));
assert.equal(rejected.size, 8);
export const reference = {reference: pin.commit, suite_sha256: suiteHash, html_grammar_correction: stamp};
const registered = new Map(cases.map(item => [item.name, structuredClone(item)]));
export function assertResult(item, result) {
  const fixed = registered.get(item.name);
  assert.ok(fixed, 'Unregistered HTML tree contract');
  assert.deepEqual(item.contexts ?? {}, fixed.contexts ?? {});
  assertInputBytes(item, capturedOriginal.get(item.name));
  compareResult(result, capturedCorrected.get(item.name), item.name);
}

// Inspection snapshots cannot change the private comparison records.
export const originalByName = structuredClone(capturedOriginal);
export const correctedByName = structuredClone(capturedCorrected);

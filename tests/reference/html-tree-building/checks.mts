import {assertSupplementalQualification} from '../../parity/qualification.mjs'
import {registeredInputGuard} from '../runtime/input-ownership.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash, type BinaryLike} from 'node:crypto';
import {assertInputBytes} from '../../parity/inputs.mjs';
import {compareResult} from '../../parity/compare.mjs';
import type {ReferenceCase, ReferenceExpected} from '../../parity/reference-fixtures.js';
import type {ValidationReport} from '../../../packages/validator/src/index.js';

type Case = ReferenceCase & {contexts?: Record<string, unknown>};
type Pair = {name: string; first: string; second: string; reference_difference: boolean};
type CaptureCase = ReferenceExpected & {status: string; report: ValidationReport};
type Capture = {commit: string; python: string; versions: unknown; corpus_sha256: string; cases: CaptureCase[]};
type Corrected = Capture & {collection_qualification: unknown; html_grammar_correction: Record<string, unknown>};
const read = async <T,>(name: string): Promise<T> => JSON.parse(await readFile(new URL(name, import.meta.url), 'utf8')) as T;
const hash = (bytes: BinaryLike) => createHash('sha256').update(bytes).digest('hex');
export const {cases} = await read<{cases: Case[]}>('inputs.json');
const assertRegisteredInput = registeredInputGuard(cases);
const {pairs} = await read<{pairs: Pair[]}>('pairs.json');
const original = await read<Capture>('original-python.json'), corrected = await read<Corrected>('corrected-python.json');
const pin = await read<{commit: string; python: string}>('../../../docs/compatibility/reference.json');
assertSupplementalQualification(corrected.collection_qualification, cases, 'tests/reference/html-tree-building/inputs.json')
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
const rawMainAgreements = new Set(['ruby-implied-rb', 'search-paragraph', 'search-dt-end']
  .map(name => `html-tree-building/${name}/collection`));
export const approvedDifferences = new Set(pairs.filter(pair => pair.reference_difference)
  .flatMap(pair => ['collection', 'hasvalue'].map(route => `html-tree-building/${pair.name}/${route}`))
  .filter(name => !rawMainAgreements.has(name)));
assert.equal(approvedDifferences.size, 7);
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
  const document: {'@graph': Array<{first: Array<Record<string, string>>; tag: Record<string, string>; hasValue: Record<string, string>}>} = JSON.parse(item.files['ro-crate-metadata.json']);
  const subject = document['@graph'][2];
  const literals = route === 'collection' ? subject.first : [subject.tag, subject.hasValue];
  assert.deepEqual(literals, [pair.first, pair.second].map(value => ({'@value': value,
    '@type': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#HTML'})));
  literals.forEach((literal, index) => {literal['@value'] = ['first identity', 'second identity'][index];});
  const shape = {document, otherFiles: Object.fromEntries(Object.entries(item.files).filter(([name]) => name !== 'ro-crate-metadata.json'))};
  if (fixtureShapes.has(route)) assert.deepEqual(shape, fixtureShapes.get(route), 'Fixture roles changed');
  else fixtureShapes.set(route, shape);
}
export const rejected = new Set(cases.filter(item => capturedCorrected.get(item.name)!.status === 'invalid').map(item => item.name));
assert.equal(rejected.size, 8);
export const reference = {reference: pin.commit, suite_sha256: suiteHash, html_grammar_correction: stamp};
export function assertResult(item: Case, result: Parameters<typeof compareResult>[0]) {
  assert.ok(capturedOriginal.has(item.name), 'Unregistered HTML tree contract');
  assertInputBytes(item, capturedOriginal.get(item.name)!);
  assertRegisteredInput(item);
  compareResult(result, capturedCorrected.get(item.name)!, item.name);
}

// Inspection snapshots cannot change the private comparison records.
export const originalByName = structuredClone(capturedOriginal);
export const correctedByName = structuredClone(capturedCorrected);

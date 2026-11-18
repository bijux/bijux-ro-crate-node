import assert from 'node:assert/strict';
import test from 'node:test';
import {validateModel} from '../../src/metadata/models/validation.js';

const uri = 'http://bia/Contributor';
const prefix = `Value error, Expected ${uri}, or bia:Contributor in types, found: `;
const cases = [
  ["Contributor's alias", '["Contributor\'s alias"]'],
  ['Contributor\talias', "['Contributor\\talias']"],
  ['Contributor\nalias', "['Contributor\\nalias']"],
  ['Contributor\u0085alias', "['Contributor\\x85alias']"],
  ['Contributor\\alias', "['Contributor\\\\alias']"],
  ['Contributor\u200dalias', "['Contributor\\u200dalias']"],
  ['Contributor\u{105c0}alias', "['Contributor\\U000105c0alias']"],
  ['Contributor\'"alias', "['Contributor\\\'\"alias']"],
];
for (const [alias, rendered] of cases) {
  test(`type-list diagnostic preserves Python quoting for ${JSON.stringify(alias)}`, () => {
    const result = validateModel({'@id': '#person', '@type': [alias], name: 'Person'}, uri);
    assert.deepEqual(result.errors, [{loc: ['@type'], msg: prefix + rendered, type: 'value_error'}]);
  });
}
test('type-list diagnostics preserve order and repeated values', () => {
  const result = validateModel({'@id': '#person', '@type': ["a'b", 'z', "a'b"], name: 'Person'}, uri);
  assert.deepEqual(result.errors, [{loc: ['@type'], msg: prefix + '["a\'b", \'z\', "a\'b"]', type: 'value_error'}]);
});
test('scalar type diagnostics interpolate the original string directly', () => {
  for (const [alias] of cases) {
    const result = validateModel({'@id': '#person', '@type': alias, name: 'Person'}, uri);
    assert.deepEqual(result.errors, [{loc: ['@type'], msg: prefix + alias, type: 'value_error'}]);
  }
});
test('recognized model types still validate without mutating the supplied entity', () => {
  const input = {'@id': '#person', '@type': [uri, "a'b"], name: 'Person'};
  const before = structuredClone(input);
  assert.deepEqual(validateModel(input, uri).errors, []);
  assert.deepEqual(input, before);
});

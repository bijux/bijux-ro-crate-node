import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {closeSync, mkdirSync, openSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const python = 'artifacts/reference/python-env/bin/python'
const py = (...args) => ({command: python, args})
const node = (...args) => ({command: process.execPath, args})
const compare = (expected, actual) => ({command: 'cmp', args: [expected, actual]})
const capture = (script, name) => [py(script, '--output', `artifacts/reports/${name}.json`),
  compare(`tests/parity/expected/${name}.json`, `artifacts/reports/${name}.json`)]

// These groups preserve the locked reference checks independently of full-crate
// oracle shards. Generated outputs must still match the committed expectations.
export const referenceGroups = {
  upstream: [
    py('scripts/reference/prepare-ontology.py'),
    py('artifacts/reference/python/scripts/ontology/check_ontology.py', '--install'),
    py('-m', 'pytest', 'artifacts/reference/python/test', '--basetemp=artifacts/work/upstream-tests',
      '-o', 'cache_dir=artifacts/cache/pytest'),
  ],
  policy: [
    node('scripts/reference/capture-profile-literal-targets.mjs', '--jobs', '2', '--output',
      'artifacts/reports/profile-literal-reference.json'),
    compare('tests/reference/profile-literal-targets/python.json', 'artifacts/reports/profile-literal-reference.json'),
  ],
  tokenizer: capture('scripts/reference/capture-tokenizer-records.py', 'tokenizer-records'),
  syntax: [
    ...capture('scripts/reference/capture-jsonld-contexts.py', 'jsonld-contexts'),
    ...capture('scripts/reference/capture-literal-identities.py', 'literal-identities'),
    ...capture('scripts/reference/capture-markup-identities.py', 'markup-identities'),
    ...capture('scripts/reference/capture-json-number-terms.py', 'json-number-terms'),
    ...capture('scripts/reference/capture-manifest-formatting.py', 'manifest-formatting'),
    ...capture('scripts/reference/capture-unicode-names.py', 'unicode-names'),
  ],
  semantics: [
    py('tests/parity/test_oracle_capture.py'),
    py('tests/parity/test_error_nodes.py'),
    {...py('tests/parity/oracle.py'), stdin: 'tests/reference/converter-failures/inputs.json',
      stdout: 'artifacts/reports/converter-failures.json'},
    node('tests/reference/converter-failures/verify-capture.mjs', 'artifacts/reports/converter-failures.json'),
    ...capture('scripts/reference/capture-datatype-errors.py', 'datatype-errors'),
    py('tests/reference/test_ontology_preparation.py'),
    py('scripts/reference/export-profile.py'),
    py('tests/parity/generators/generate-profile-inference.py'),
    {command: 'git', args: ['diff', '--exit-code', '--',
      'packages/validator/src/profile/shapes.json', 'packages/validator/src/profile/ontology.json',
      'packages/validator/src/profile/inference/datatypes.json', 'packages/validator/src/profile/inference/axioms.json',
      'tests/parity/expected/profile-inference.json']},
    py('tests/parity/generators/generate-url-cases.py'),
    py('tests/parity/generators/generate-manifest-values.py'),
    py('tests/parity/generators/generate-tsv-records.py'),
    {command: 'git', args: ['diff', '--exit-code', '--', 'tests/parity/expected/url-cases.json',
      'tests/parity/expected/manifest-values.json', 'tests/parity/expected/tsv-records.json']},
  ],
}

export function runReferenceGroup(group) {
  assert.ok(Object.hasOwn(referenceGroups, group), 'Unknown reference group: ' + group)
  mkdirSync(resolve(root, 'artifacts/reports'), {recursive: true})
  mkdirSync(resolve(root, 'artifacts/work'), {recursive: true})
  mkdirSync(resolve(root, 'artifacts/cache'), {recursive: true})
  const results = []
  for (const step of referenceGroups[group]) {
    const started = Date.now()
    console.error(`[reference:${group}] start ${[step.command, ...step.args].join(' ')}`)
    const descriptors = []
    try {
      const input = step.stdin ? openSync(resolve(root, step.stdin), 'r') : 'inherit'
      if (typeof input === 'number') descriptors.push(input)
      const output = step.stdout ? openSync(resolve(root, step.stdout), 'w') : 'inherit'
      if (typeof output === 'number') descriptors.push(output)
      const result = spawnSync(step.command, step.args, {cwd: root, stdio: [input, output, 'inherit'],
        env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}})
      assert.ifError(result.error)
      assert.equal(result.status, 0, `Reference command failed (${result.signal ?? result.status}): ${step.command}`)
      const seconds = (Date.now() - started) / 1000
      results.push({...step, seconds, status: result.status})
      console.error(`[reference:${group}] passed in ${seconds.toFixed(3)}s`)
    } finally {
      for (const descriptor of descriptors) closeSync(descriptor)
    }
  }
  writeFileSync(resolve(root, `artifacts/reports/reference-checks-${group}.json`),
    JSON.stringify({group, passed: results.length, commands: results}, null, 2) + '\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [group, ...extra] = process.argv.slice(2)
  assert.equal(extra.length, 0, 'Use reference-checks.mjs upstream|policy|tokenizer|syntax|semantics|--list')
  if (group === '--list') console.log(JSON.stringify(referenceGroups, null, 2))
  else runReferenceGroup(group)
}

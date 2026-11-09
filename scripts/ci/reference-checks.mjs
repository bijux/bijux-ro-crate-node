import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {closeSync, mkdirSync, openSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const python = process.env.BIA_PYTHON ?? 'artifacts/reference/python-env/bin/python'
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
  'upstream-defects': [
    py('tests/reference/temporal-literals/test_capture_scope.py'),
    node('--test', 'tests/reference/temporal-literals/contracts.test.mjs'),
    {...py('tests/reference/temporal-literals/capture.py'), stdin: 'tests/reference/temporal-literals/inputs.json',
      stdout: 'artifacts/reports/temporal-literals-original.json', env: {PYTHONHASHSEED: '0'}},
    {...py('tests/reference/temporal-literals/capture.py', '--corrected'), stdin: 'tests/reference/temporal-literals/inputs.json',
      stdout: 'artifacts/reports/temporal-literals-corrected.json', env: {PYTHONHASHSEED: '0'}},
    node('tests/reference/temporal-literals/verify-capture.mjs', 'artifacts/reports/temporal-literals-original.json',
      'artifacts/reports/temporal-literals-corrected.json'),
    node('scripts/reference/capture-profile-literal-targets.mjs', '--jobs', '2', '--output',
      'artifacts/reports/profile-literal-reference.json'),
    compare('tests/reference/profile-literal-targets/python.json', 'artifacts/reports/profile-literal-reference.json'),
    {...py('tests/parity/oracle.py'), stdin: 'tests/reference/converter-failures/inputs.json',
      stdout: 'artifacts/reports/converter-failures.json'},
    node('tests/reference/converter-failures/verify-capture.mjs', 'artifacts/reports/converter-failures.json'),
    {...py('tests/reference/blank-node-diagnostics/capture.py', '--prove'),
      stdout: 'artifacts/reports/diagnostic-identity-proof.json', env: {PYTHONHASHSEED: '0'}},
    {...py('tests/reference/blank-node-diagnostics/capture.py'), stdin: 'tests/reference/blank-node-diagnostics/inputs.json',
      stdout: 'artifacts/reports/blank-node-diagnostics.json', env: {PYTHONHASHSEED: '0'}},
    node('tests/reference/blank-node-diagnostics/verify-capture.mjs', 'artifacts/reports/blank-node-diagnostics.json'),
    {...py('tests/reference/blank-node-diagnostics/capture.py', '--corrected'), stdin: 'tests/reference/blank-node-diagnostics/inputs.json',
      stdout: 'artifacts/reports/corrected-diagnostics.json', env: {PYTHONHASHSEED: '0'}},
    node('tests/reference/blank-node-diagnostics/verify-capture.mjs', 'artifacts/reports/corrected-diagnostics.json', '--corrected'),
    {...py('tests/parity/oracle.py'), stdin: 'tests/reference/disabled-context-terms/inputs.json',
      stdout: 'artifacts/reports/disabled-context-terms.json'},
    node('tests/reference/disabled-context-terms/verify-capture.mjs', 'artifacts/reports/disabled-context-terms.json'),
    {...py('tests/reference/disabled-context-terms/capture-graphs.py'),
      stdout: 'artifacts/reports/disabled-context-graphs.json'},
    compare('tests/reference/disabled-context-terms/graphs.json', 'artifacts/reports/disabled-context-graphs.json'),
    py('tests/parity/generators/generate-metadata-cases.py'),
    {command: 'git', args: ['diff', '--exit-code', '--', 'tests/parity/expected/metadata-cases.json',
      'tests/reference/disabled-context-terms/original-primitive.json']},
    {...py('tests/parity/oracle.py'), stdin: 'tests/reference/root-context-propagation/inputs.json',
      stdout: 'artifacts/reports/root-context-propagation.json', env: {PYTHONHASHSEED: '0'}},
    node('tests/reference/root-context-propagation/verify-capture.mjs', 'artifacts/reports/root-context-propagation.json'),
    {...py('scripts/reference/capture-root-context-propagation.py', '--output',
      'artifacts/reports/root-context-graphs.json'), env: {PYTHONHASHSEED: '0'}},
    compare('tests/reference/root-context-propagation/graphs.json', 'artifacts/reports/root-context-graphs.json'),
    py('scripts/reference/capture-import-keywords.py', '--inputs',
      'tests/reference/root-context-propagation/original-import-primitive.json', '--output',
      'artifacts/reports/root-import-primitive.json'),
    node('tests/reference/root-context-propagation/verify-import-primitive.mjs',
      'artifacts/reports/root-import-primitive.json'),
    {...py('tests/parity/oracle.py'), stdin: 'tests/reference/url-authorities/inputs.json',
      stdout: 'artifacts/reports/url-authorities.json', env: {PYTHONHASHSEED: '0'}},
    node('tests/reference/url-authorities/verify-capture.mjs', 'artifacts/reports/url-authorities.json'),
    {...py('tests/reference/key-equality/capture.py'), stdin: 'tests/reference/key-equality/inputs.json',
      stdout: 'artifacts/reports/key-equality-original.json', env: {PYTHONHASHSEED: '0'}},
    node('tests/reference/key-equality/verify-capture.mjs', 'original', 'artifacts/reports/key-equality-original.json'),
    {...py('tests/reference/key-equality/capture.py', '--corrected'), stdin: 'tests/reference/key-equality/inputs.json',
      stdout: 'artifacts/reports/key-equality-corrected.json', env: {PYTHONHASHSEED: '0'}},
    node('tests/reference/key-equality/verify-capture.mjs', 'corrected', 'artifacts/reports/key-equality-corrected.json'),
    {...py('tests/reference/key-equality/capture-primitive.py'), stdout: 'artifacts/reports/key-equality-primitive.json'},
    compare('tests/reference/key-equality/primitive.json', 'artifacts/reports/key-equality-primitive.json'),
    py('tests/reference/key-equality/test_capture_scope.py'),
    {...py('tests/reference/manifest-inference/capture.py', '--integrity-output',
      'artifacts/reports/manifest-original-integrity.json'), stdin: 'tests/reference/manifest-inference/inputs.json',
      stdout: 'artifacts/reports/manifest-inference-original.json', env: {PYTHONHASHSEED: '0'}},
    node('tests/reference/manifest-inference/verify-capture.mjs', 'original', 'artifacts/reports/manifest-inference-original.json'),
    {...py('tests/reference/manifest-inference/capture.py', '--corrected', '--integrity-output',
      'artifacts/reports/manifest-corrected-integrity.json'), stdin: 'tests/reference/manifest-inference/inputs.json',
      stdout: 'artifacts/reports/manifest-inference-corrected.json', env: {PYTHONHASHSEED: '0'}},
    node('tests/reference/manifest-inference/verify-capture.mjs', 'corrected', 'artifacts/reports/manifest-inference-corrected.json'),
    {...py('tests/reference/manifest-inference/prove-mechanisms.py', '--workdir',
      'artifacts/work/manifest-proof-inputs', '--details-output', 'artifacts/reports/manifest-proof-details.json'),
      stdout: 'artifacts/reports/manifest-inference-proof.json', env: {PYTHONHASHSEED: '0'}},
    compare('tests/reference/manifest-inference/mechanisms.json', 'artifacts/reports/manifest-inference-proof.json'),
    py('tests/reference/manifest-inference/test_capture_scope.py'),
    node('tests/reference/upstream-defects/run.mjs'),
  ],
  'literal-grammar': [
    py('tests/reference/html-tree-building/test_correction.py'),
    {...py('tests/reference/html-tree-building/capture.py'), stdin: 'tests/reference/html-tree-building/inputs.json',
      stdout: 'artifacts/reports/html-grammar-original.json', env: {PYTHONHASHSEED: '0'}},
    node('tests/reference/html-tree-building/verify-capture.mjs', 'artifacts/reports/html-grammar-original.json'),
    {...py('tests/reference/html-tree-building/capture.py', '--corrected'), stdin: 'tests/reference/html-tree-building/inputs.json',
      stdout: 'artifacts/reports/html-grammar-corrected.json', env: {PYTHONHASHSEED: '0'}},
    node('tests/reference/html-tree-building/verify-capture.mjs', 'artifacts/reports/html-grammar-corrected.json', '--corrected'),
    py('tests/reference/html-tree-building/capture-trees.py', '--output', 'artifacts/reports/html-grammar-trees.json'),
    node('tests/reference/html-tree-building/verify-capture.mjs', 'artifacts/reports/html-grammar-trees.json', '--trees'),
    {...py('tests/parity/oracle.py'), stdin: 'tests/reference/xml-name-edition/inputs.json',
      stdout: 'artifacts/reports/xml-name-edition.json', env: {PYTHONHASHSEED: '0'}},
    node('tests/reference/xml-name-edition/verify-capture.mjs', 'artifacts/reports/xml-name-edition.json'),
    node('tests/reference/literal-grammar/run.mjs'),
  ],
  'inferred-collections-original': [
    {...py('tests/reference/inferred-collections/prove-lists.py'), stdout: 'artifacts/reports/inferred-list-proof.json'},
    compare('tests/reference/inferred-collections/list-proof.json', 'artifacts/reports/inferred-list-proof.json'),
    {...py('tests/reference/inferred-collections/prove-pairs.py'), stdout: 'artifacts/reports/inferred-pair-proof.json'},
    compare('tests/reference/inferred-collections/pair-proof.json', 'artifacts/reports/inferred-pair-proof.json'),
    {...py('tests/reference/inferred-collections/capture.py'), stdin: 'tests/reference/inferred-collections/inputs.json',
      stdout: 'artifacts/reports/inferred-collections-original.json', env: {PYTHONHASHSEED: '0'}},
    node('tests/reference/inferred-collections/verify-capture.mjs', 'original', 'artifacts/reports/inferred-collections-original.json'),
    {...py('tests/parity/oracle.py'), stdin: 'tests/reference/collection-diagnostics/ordinary-inputs.json',
      stdout: 'artifacts/reports/collection-diagnostics-controls.json', env: {PYTHONHASHSEED: '0'}},
    node('tests/reference/collection-diagnostics/verify-capture.mjs', 'ordinary', 'artifacts/reports/collection-diagnostics-controls.json'),
    {...py('tests/reference/collection-diagnostics/capture.py'), stdin: 'tests/reference/collection-diagnostics/inputs.json',
      stdout: 'artifacts/reports/collection-diagnostics-original.json', env: {PYTHONHASHSEED: '0'}},
    node('tests/reference/collection-diagnostics/verify-capture.mjs', 'original', 'artifacts/reports/collection-diagnostics-original.json'),
  ],
  'inferred-collections-corrected': [
    py('tests/reference/inferred-collections/test_capture_scope.py'),
    {...py('tests/reference/inferred-collections/prove-branching.py'), stdout: 'artifacts/reports/inferred-branching-proof.json'},
    compare('tests/reference/inferred-collections/branching-proof.json', 'artifacts/reports/inferred-branching-proof.json'),
    {...py('tests/reference/inferred-collections/capture.py', '--corrected'), stdin: 'tests/reference/inferred-collections/inputs.json',
      stdout: 'artifacts/reports/inferred-collections-corrected.json', env: {PYTHONHASHSEED: '0'}},
    node('tests/reference/inferred-collections/verify-capture.mjs', 'corrected', 'artifacts/reports/inferred-collections-corrected.json'),
    node('tests/reference/inferred-collections/run.mjs'),
    py('tests/reference/collection-diagnostics/test_capture_scope.py'),
    node('--test', 'tests/reference/collection-diagnostics/checks.test.mjs'),
    {...py('tests/reference/collection-diagnostics/prove.py'), stdout: 'artifacts/reports/collection-diagnostics-proof.json'},
    compare('tests/reference/collection-diagnostics/proof.json', 'artifacts/reports/collection-diagnostics-proof.json'),
    {...py('tests/reference/collection-diagnostics/capture.py', '--corrected'), stdin: 'tests/reference/collection-diagnostics/inputs.json',
      stdout: 'artifacts/reports/collection-diagnostics-corrected.json', env: {PYTHONHASHSEED: '0'}},
    node('tests/reference/collection-diagnostics/verify-capture.mjs', 'corrected', 'artifacts/reports/collection-diagnostics-corrected.json'),
    node('tests/reference/collection-diagnostics/run.mjs'),
  ],
  tokenizer: [...capture('scripts/reference/capture-tokenizer-records.py', 'tokenizer-records'),
    py('tests/reference/manifest-numeric-identity/capture-arithmetic.py'),
    node('tests/reference/manifest-numeric-identity/run.mjs')],
  syntax: [
    py('tests/reference/reserved-type-identifiers/observers/test_correction.py'),
    {...py('tests/reference/reserved-type-identifiers/observers/capture.py'),
      stdin: 'tests/reference/reserved-type-identifiers/observers/inputs.json',
      stdout: 'artifacts/reports/reserved-type-original.json', env: {PYTHONHASHSEED: '0'}},
    node('tests/reference/reserved-type-identifiers/observers/verify-capture.mjs', 'original',
      'artifacts/reports/reserved-type-original.json'),
    {...py('tests/reference/reserved-type-identifiers/observers/capture.py', '--corrected'),
      stdin: 'tests/reference/reserved-type-identifiers/observers/inputs.json',
      stdout: 'artifacts/reports/reserved-type-corrected.json', env: {PYTHONHASHSEED: '0'}},
    node('tests/reference/reserved-type-identifiers/observers/verify-capture.mjs', 'corrected',
      'artifacts/reports/reserved-type-corrected.json'),
    node('tests/reference/reserved-type-identifiers/observers/run.mjs'),
    {...py('tests/reference/node-indexed-containers/capture.py'),
      stdout: 'artifacts/reports/node-indexed-container-graphs.json'},
    compare('tests/reference/node-indexed-containers/graphs.json', 'artifacts/reports/node-indexed-container-graphs.json'),
    {...py('tests/reference/reserved-type-identifiers/capture.py'),
      stdout: 'artifacts/reports/reserved-type-graphs.json'},
    compare('tests/reference/reserved-type-identifiers/graphs.json', 'artifacts/reports/reserved-type-graphs.json'),
    {...py('tests/reference/language-indexed-containers/capture.py'),
      stdout: 'artifacts/reports/language-indexed-container-graphs.json'},
    compare('tests/reference/language-indexed-containers/graphs.json', 'artifacts/reports/language-indexed-container-graphs.json'),
    {...py('tests/reference/jsonld-containers/capture-expansion.py'),
      stdout: 'artifacts/reports/jsonld-graph-expansion.json'},
    compare('tests/reference/jsonld-containers/graph-expanded.json', 'artifacts/reports/jsonld-graph-expansion.json'),
    {...py('tests/reference/jsonld-containers/capture-expansion.py', '--types'),
      stdout: 'artifacts/reports/jsonld-type-expansion.json'},
    compare('tests/reference/jsonld-containers/type-expanded.json', 'artifacts/reports/jsonld-type-expansion.json'),
    ...capture('scripts/reference/capture-jsonld-contexts.py', 'jsonld-contexts'),
    ...capture('scripts/reference/capture-import-keywords.py', 'import-keywords'),
    ...capture('scripts/reference/capture-relative-contexts.py', 'relative-contexts'),
    py('scripts/reference/capture-relative-contexts.py', '--inputs',
      'tests/parity/contexts/empty-node-mappings.json', '--output', 'artifacts/reports/empty-node-mappings.json'),
    compare('tests/parity/expected/empty-node-mappings.json', 'artifacts/reports/empty-node-mappings.json'),
    py('scripts/reference/capture-relative-contexts.py', '--inputs',
      'tests/parity/contexts/unbased-node-identifiers.json', '--output', 'artifacts/reports/unbased-node-identifiers.json'),
    compare('tests/parity/expected/unbased-node-identifiers.json', 'artifacts/reports/unbased-node-identifiers.json'),
    ...capture('scripts/reference/capture-literal-identities.py', 'literal-identities'),
    ...capture('scripts/reference/capture-markup-identities.py', 'markup-identities'),
    ...capture('scripts/reference/capture-html-tree-errors.py', 'html-tree-errors'),
    ...capture('scripts/reference/capture-xml-source.py', 'xml-source-identities'),
    ...capture('scripts/reference/capture-json-number-terms.py', 'json-number-terms'),
    ...capture('scripts/reference/capture-manifest-formatting.py', 'manifest-formatting'),
    ...capture('scripts/reference/capture-rdf-namespaces.py', 'rdf-namespaces'),
    ...capture('scripts/reference/capture-unicode-names.py', 'unicode-names'),
  ],
  semantics: [
    py('tests/parity/test_oracle_capture.py'),
    py('tests/parity/test_error_nodes.py'),
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
        env: {...process.env, ...step.env, PYTHONDONTWRITEBYTECODE: '1'}})
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
  assert.equal(extra.length, 0, 'Use reference-checks.mjs upstream|upstream-defects|literal-grammar|inferred-collections-original|inferred-collections-corrected|tokenizer|syntax|semantics|--list')
  if (group === '--list') console.log(JSON.stringify(referenceGroups, null, 2))
  else runReferenceGroup(group)
}

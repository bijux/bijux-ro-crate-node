import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {referenceGroups} from '../../scripts/ci/reference-checks.mjs'
const normalize = step => ({...step, command: step.command.endsWith('/node') ? 'node' : step.command.endsWith('/python') ? 'python' : step.command})

test('focused syntax groups retain every original command, input, environment and source role', () => {
  const names = ['syntax-contexts', 'syntax-values', 'syntax-lexical']
  assert.deepEqual(names.map(name => referenceGroups[name]?.length), [35, 15, 12])
  assert.ok(!Object.hasOwn(referenceGroups, 'syntax'))
  const steps = names.flatMap(name => referenceGroups[name]).map(normalize)
  assert.equal(steps.length, 62)
  const digest = createHash('sha256').update(JSON.stringify(steps.map(step => JSON.stringify(step)).sort())).digest('hex')
  assert.equal(digest, '49ed264c1a545a3ec52713756068855929987264994a50802b69b7080462539a')
})

test('validation requires each reference group and all eight browser partitions without longer timeouts', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/validation.yml', import.meta.url), 'utf8')
  const job = name => workflow.match(new RegExp('^  ' + name + ':\\n([\\s\\S]*?)(?=^  [a-z][a-z0-9-]*:\\n|(?![\\s\\S]))', 'm'))?.[1]
  const reference = job('reference-checks')
  const matrix = reference.match(/        group:\n((?:        - [a-z-]+\n)+)/)[1]
  assert.deepEqual([...matrix.matchAll(/        - ([a-z-]+)/g)].map(row => row[1]),
    ['upstream', 'syntax-contexts', 'syntax-values', 'syntax-lexical', 'collection-list-proofs',
      'collection-diagnostics-original', 'tokenizer', 'semantics'])
  for (const name of ['syntax-contexts', 'syntax-values', 'syntax-lexical', 'collection-list-proofs', 'collection-diagnostics-original'])
    assert.ok(reference.includes('        - ' + name + '\n'), name)
  assert.match(job('reference'), /    - reference-checks\n/)
  assert.match(job('reference'), /    - inferred-collections\n/)
  assert.match(job('reference-checks'), /timeout-minutes: 5/)
  assert.match(job('inferred-collections'), /timeout-minutes: 5/)
  assert.match(job('browser-corpus'), /BIJUX_TEST_SHARD: \$\{\{ matrix.shard \}\}\/8/)
  assert.match(job('browsers'), /verify-coverage.mjs browser artifacts\/coverage 8/)
})

test('expensive original collection capture keeps the full verifier and leaves proofs and diagnostics independently required', () => {
  assert.equal(referenceGroups['inferred-collections-original'].length, 2)
  assert.deepEqual(referenceGroups['inferred-collections-original'][0].args, ['tests/reference/inferred-collections/capture-original.mjs'])
  assert.deepEqual(referenceGroups['inferred-collections-original'][1].args,
    ['tests/reference/inferred-collections/verify-capture.mjs', 'original', 'artifacts/reports/inferred-collections-original.json'])
  assert.equal(referenceGroups['collection-list-proofs'].length, 4)
  assert.equal(referenceGroups['collection-diagnostics-original'].length, 4)
  const controls = ['collection-list-proofs', 'collection-diagnostics-original']
    .flatMap(name => referenceGroups[name]).map(normalize).map(step => JSON.stringify(step)).sort()
  assert.equal(createHash('sha256').update(JSON.stringify(controls)).digest('hex'),
    'ade17084d1e8de26247feeb633a15746e9499c65f5503d9eda77ad2c2eb4a683')
})

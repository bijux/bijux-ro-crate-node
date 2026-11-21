import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {referenceGroups} from '../../scripts/ci/reference-checks.mjs'
type ReferenceCommand = (typeof referenceGroups)[string][number]
const normalize = (step: ReferenceCommand) => ({...step, command: step.command.endsWith('/node') ? 'node' : step.command.endsWith('/python') ? 'python' : step.command})

test('focused syntax groups retain every original command, input, environment and source role', () => {
  const names = ['syntax-contexts', 'syntax-values', 'syntax-lexical']
  assert.deepEqual(names.map(name => referenceGroups[name]?.length), [35, 15, 12])
  assert.ok(!Object.hasOwn(referenceGroups, 'syntax'))
  const steps = names.flatMap(name => referenceGroups[name]).map(normalize)
  assert.equal(steps.length, 62)
  const digest = createHash('sha256').update(JSON.stringify(steps.map(step => JSON.stringify(step)).sort())).digest('hex')
  assert.equal(digest, 'ed41e7cb397c331af5a200b1c692893ffe9f68a89206b7ab0f81bf14ff71f4bf')
})

test('validation requires each reference group and all eight browser partitions', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/validation.yml', import.meta.url), 'utf8')
  const job = (name: string) => workflow.match(new RegExp('^  ' + name + ':\\n([\\s\\S]*?)(?=^  [a-z][a-z0-9-]*:\\n|(?![\\s\\S]))', 'm'))?.[1]!
  const reference = job('reference-checks')
  const matrix = reference.match(/        group:\n((?:        - [a-z0-9-]+\n)+)/)![1]
  assert.deepEqual([...matrix.matchAll(/        - ([a-z0-9-]+)/g)].map(row => row[1]),
    ['upstream-0', 'upstream-1', 'upstream-2', 'upstream-3', 'syntax-contexts', 'syntax-values', 'syntax-lexical', 'collection-list-proofs',
      'collection-diagnostics-original', 'tokenizer', 'semantics'])
  for (const name of ['syntax-contexts', 'syntax-values', 'syntax-lexical', 'collection-list-proofs', 'collection-diagnostics-original'])
    assert.ok(reference.includes('        - ' + name + '\n'), name)
  assert.match(job('reference'), /    - reference-checks\n/)
  assert.match(job('reference'), /    - inferred-collections\n/)
  assert.match(reference, /timeout-minutes: 5/)
  for (const name of ['upstream-defects', 'literal-grammar', 'inferred-collections'])
    assert.match(job(name), /timeout-minutes: 8/, name)
  assert.match(job('oracle'), /timeout-minutes: 8/)
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

test('corrected capture and its independent controls remain complete required lanes', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/validation.yml', import.meta.url), 'utf8')
  const job = workflow.match(/^  inferred-collections:\n([\s\S]*?)(?=^  [a-z][a-z0-9-]*:\n)/m)![1]
  const modes = job.match(/        mode:\n((?:        - [a-z-]+\n)+)/)![1]
  assert.deepEqual([...modes.matchAll(/        - ([a-z-]+)/g)].map(row => row[1]), ['original', 'corrected', 'corrected-controls'])
  assert.match(job, /fail-fast: false/)
  assert.match(job, /reference-checks\.mjs inferred-collections-\$\{\{ matrix\.mode \}\}/)
  assert.match(job, /- uses: actions\/upload-artifact@[^\n]+\n      with:\n        name: inferred-collections-\$\{\{ matrix\.mode \}\}\n        path: \|-\n          artifacts\/reports\n          artifacts\/logs\n        if-no-files-found: error\n        compression-level: 0\n      if: \$\{\{ always\(\) \}\}/)
  const names = ['inferred-collections-corrected', 'inferred-collections-corrected-controls']
  assert.deepEqual(names.map(name => referenceGroups[name]?.length), [2, 11])
  assert.deepEqual(referenceGroups[names[0]].map(step => step.args), [
    ['tests/reference/inferred-collections/capture.py', '--corrected'],
    ['tests/reference/inferred-collections/verify-capture.mjs', 'corrected', 'artifacts/reports/inferred-collections-corrected.json'],
  ])
  const controls = referenceGroups[names[1]]
  assert.ok(controls.some(step => step.command === process.execPath &&
    step.args.join(' ') === '--import tsx --test tests/reference/collection-diagnostics/checks.test.ts'),
  'Collection diagnostic controls must run their TypeScript source')
  for (const report of ['inferred-branching-proof', 'collection-diagnostics-proof', 'collection-diagnostics-corrected']) {
    const path = `artifacts/reports/${report}.json`
    const producer = controls.findIndex(step => step.stdout === path)
    const consumer = controls.findIndex(step => step.args.includes(path))
    assert.ok(producer >= 0 && consumer > producer, `${report} must be produced before it is checked`)
  }
  const commands = names.flatMap(name => referenceGroups[name]).map(normalize).map(step => JSON.stringify(step)).sort()
  assert.equal(createHash('sha256').update(JSON.stringify(commands)).digest('hex'),
    'df040c1286cfc07db13c6a394fe4ccde210fedc50b400b0c84ae084acf74a64c')
})

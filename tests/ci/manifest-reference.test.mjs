import assert from 'node:assert/strict'
import test from 'node:test'
import {referenceGroups} from '../../scripts/ci/reference-checks.mjs'

const steps = referenceGroups['upstream-defects']
const scripts = steps.filter(step => step.args.some(arg => arg.startsWith('tests/reference/manifest-inference/')))

test('manifest qualification requires fresh original and corrected complete captures', () => {
  const captures = scripts.filter(step => step.args[0] === 'tests/reference/manifest-inference/capture.py')
  assert.equal(captures.length, 2)
  assert.deepEqual(captures.map(step => step.args.includes('--corrected')), [false, true])
  for (const [index, kind] of ['original', 'corrected'].entries()) {
    const capture = captures[index]
    assert.equal(capture.stdin, 'tests/reference/manifest-inference/inputs.json')
    assert.equal(capture.stdout, 'artifacts/reports/manifest-inference-' + kind + '.json')
    assert.equal(capture.env.PYTHONHASHSEED, '0')
    assert.ok(capture.args.includes('--integrity-output'))
    const verification = scripts.find(step => step.args[0] === 'tests/reference/manifest-inference/verify-capture.mjs' && step.args[1] === kind)
    assert.deepEqual(verification.args, ['tests/reference/manifest-inference/verify-capture.mjs', kind, capture.stdout])
    assert.ok(steps.indexOf(capture) < steps.indexOf(verification))
  }
})

test('full frame proof and scope negatives precede the required aggregate validator', () => {
  const proof = scripts.find(step => step.args[0] === 'tests/reference/manifest-inference/prove-mechanisms.py')
  assert.ok(proof)
  assert.deepEqual(proof.args, ['tests/reference/manifest-inference/prove-mechanisms.py', '--workdir',
    'artifacts/work/manifest-proof-inputs', '--details-output', 'artifacts/reports/manifest-proof-details.json'])
  assert.equal(proof.stdout, 'artifacts/reports/manifest-inference-proof.json')
  assert.equal(proof.env.PYTHONHASHSEED, '0')
  const comparison = scripts.find(step => step.command === 'cmp')
  assert.deepEqual(comparison.args, ['tests/reference/manifest-inference/mechanisms.json', proof.stdout])
  const scope = scripts.find(step => step.args[0] === 'tests/reference/manifest-inference/test_capture_scope.py')
  assert.ok(scope)
  const aggregate = steps.find(step => step.args[0] === 'tests/reference/upstream-defects/run.mjs')
  for (const step of scripts) assert.ok(steps.indexOf(step) < steps.indexOf(aggregate))
  assert.ok(steps.indexOf(proof) < steps.indexOf(comparison))
})

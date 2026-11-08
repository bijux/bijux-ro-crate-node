import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import test from 'node:test'
import {capturePartitions, corpusHash} from '../../scripts/reference/oracle-partitions.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const cases = Array.from({length: 4}, (_, index) => ({name: 'policy/' + index,
  files: {'metadata.json': 'méta🙂' + index}, contexts: {context: {'@context': {label: 'https://example.org/' + index}}}}))
const reference = {commit: 'a'.repeat(40)}
const metadata = {python: '3.13.12', context_sha256: 'b'.repeat(64), versions: {pydantic: '2.12.5', 'bia-ro-crate-validator': '0.3.1'}}
const capture = items => ({commit: reference.commit, ...structuredClone(metadata), imported_module: '/reference/src/bia_ro_crate/__init__.py',
  corpus_sha256: corpusHash(items), cases: items.map(item => ({name: item.name,
    inputs_sha256: Object.fromEntries(Object.entries(item.files).map(([name, value]) =>
      [name, createHash('sha256').update(value).digest('hex')]))}))})
const options = {cases, reference, metadata}

test('oracle partitions overlap while restoring the original full input order and digest', async () => {
  const started = [], releases = []
  const result = capturePartitions({...options, jobs: 2, run: (items, index) => {
    started.push(items.map(item => item.name))
    return new Promise(resolve => {releases[index] = () => resolve(capture(items))})
  }})
  await new Promise(setImmediate)
  assert.deepEqual(started, [['policy/0', 'policy/2'], ['policy/1', 'policy/3']])
  releases[1](); releases[0]()
  const actual = await result
  assert.equal(actual.corpus_sha256, corpusHash(cases))
  assert.deepEqual(actual.cases.map(item => item.name), cases.map(item => item.name))
  let calls = 0
  const serial = await capturePartitions({...options, jobs: 1, run: async items => {calls++; return capture(items)}})
  assert.equal(calls, 1)
  assert.deepEqual(actual, serial)
})

test('a rejected oracle process does not abandon its running sibling', async () => {
  let release, completed = false, settled = false
  const result = capturePartitions({...options, jobs: 2, run: async (items, index) => {
    if (index === 0) throw new Error('oracle failure')
    await new Promise(resolve => {release = resolve})
    completed = true
    return capture(items)
  }})
  void result.then(() => {settled = true}, () => {settled = true})
  await new Promise(setImmediate)
  assert.equal(settled, false)
  release()
  await assert.rejects(result, AggregateError)
  assert.equal(completed, true)
})

test('oracle partitions bind every case, context and interpreter receipt', async () => {
  const changes = [
    oracle => {oracle.commit = 'wrong'},
    oracle => {oracle.python = '3.13.11'},
    oracle => {oracle.context_sha256 = 'wrong'},
    oracle => {oracle.versions.pydantic = 'wrong'},
    oracle => {delete oracle.versions['bia-ro-crate-validator']},
    oracle => {oracle.imported_module = '/another/source.py'},
    oracle => {oracle.corpus_sha256 = corpusHash(cases.map(item => ({...item, contexts: {}})))},
    oracle => {oracle.cases.reverse()},
    oracle => {oracle.cases.pop()},
    oracle => {oracle.cases[0].inputs_sha256['metadata.json'] = 'wrong'},
  ]
  for (const change of changes) await assert.rejects(capturePartitions({...options, jobs: 2,
    run: async (items, index) => {const oracle = capture(items); if (index) change(oracle); return oracle}}))
  await assert.rejects(capturePartitions({...options, jobs: 3, run: capture}), /jobs must be 1 or 2/)
})

test('policy capture rejects missing, duplicated and unsupported process flags before launching Python', () => {
  for (const args of [['--jobs', '0'], ['--jobs', '3'], ['--jobs'], ['--jobs', '2', '--jobs', '1'], ['--unknown', '2']]) {
    const result = spawnSync(process.execPath, ['scripts/reference/capture-profile-literal-targets.mjs', ...args],
      {cwd: root, encoding: 'utf8', timeout: 10000, env: {...process.env, BIA_PYTHON: resolve(root, 'artifacts/nonexistent-python')}})
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Oracle jobs must be 1 or 2|Use --output path and\/or --jobs 1\|2 once/)
    assert.doesNotMatch(result.stderr, /ENOENT/)
  }
})

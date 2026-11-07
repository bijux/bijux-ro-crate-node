import assert from 'node:assert/strict'
import test from 'node:test'
import {reportOf} from '@bijux/ro-crate-core'
import {Session} from '../../packages/validator/src/browser/session.js'

const valid = {status: 'valid', report: reportOf([])}
const invalid = {status: 'invalid', report: reportOf([{message: 'missing name', severity: 40, location_description: null}])}

function setup() {
  const workers = []
  const session = new Session({debounceMs: 1000, workerFactory: () => {
    const worker = {terminate() {this.terminated = true}, postMessage(request) {this.request = request}}
    workers.push(worker)
    return worker
  }})
  const run = () => {session.revalidate(); return workers.at(-1)}
  const reply = (worker, result) => worker.onmessage({data: {...worker.request, result}})
  return {session, workers, run, reply}
}

test('late success cannot approve an edited or reselected crate', () => {
  const {session, run, reply} = setup()
  try {
    session.select(new Map([['metadata.json', 'original']]))
    const old = run(), late = old.onmessage
    session.edit('metadata.json', 'invalid edit')
    assert.equal(session.snapshot().eligible, false)
    assert.throws(() => session.continue(), /current revision/)
    const current = run()
    late({data: {...old.request, result: valid}})
    assert.equal(old.terminated, true)
    assert.equal(session.snapshot().state, 'validating')
    reply(current, invalid)
    assert.equal(session.snapshot().state, 'invalid')
    session.edit('metadata.json', 'repaired')
    reply(run(), valid)
    assert.equal(session.continue().files.get('metadata.json'), 'repaired')
    session.continue().files.set('metadata.json', 'caller mutation')
    assert.equal(session.continue().files.get('metadata.json'), 'repaired')
    session.select(new Map([['metadata.json', 'other crate']]))
    assert.equal(session.snapshot().eligible, false)
  } finally {session.dispose()}
})

test('options, crashes and malformed replies invalidate prior approval', () => {
  const {session, run, reply} = setup()
  try {
    session.select(new Map([['metadata.json', 'selected']]))
    reply(run(), valid)
    session.updateOptions({contexts: new Map([['context', {'@context': {}}]])})
    assert.equal(session.snapshot().eligible, false)
    run().onerror({message: 'worker crashed'})
    assert.equal(session.snapshot().state, 'incomplete')
    const worker = run()
    worker.onmessage({data: {...worker.request, result: {status: 'valid'}}})
    assert.equal(session.snapshot().state, 'incomplete')
    const contradictory = run()
    contradictory.onmessage({data: {...contradictory.request, result: {...invalid, status: 'valid'}}})
    assert.equal(session.snapshot().state, 'incomplete')
    assert.equal(session.snapshot().eligible, false)
    reply(run(), valid)
    const revision = session.snapshot().revision
    session.edit('metadata.json', 'changed at continuation')
    assert.ok(session.snapshot().revision > revision)
    assert.throws(() => session.continue(), /current revision/)
  } finally {session.dispose()}
})

test('disposal refuses delayed callbacks and releases pending work', () => {
  const {session, run} = setup()
  session.select(new Map([['metadata.json', 'selected']]))
  const worker = run(), late = worker.onmessage
  session.dispose()
  late({data: {...worker.request, result: valid}})
  assert.equal(worker.terminated, true)
  assert.equal(session.snapshot().eligible, false)
  assert.throws(() => session.continue(), /disposed/)
})


test('a reentrant validation request captures the newly selected files', () => {
  const {session, workers, run, reply} = setup()
  try {
    session.select(new Map([['metadata.json', 'first']]))
    reply(run(), valid)
    let armed = true
    session.subscribe(state => {
      if (armed && state.state === 'editing') {armed = false; session.revalidate()}
    })
    session.select(new Map([['metadata.json', 'second']]))
    assert.equal(workers.at(-1).request.files.get('metadata.json'), 'second')
    reply(workers.at(-1), valid)
    assert.equal(session.continue().files.get('metadata.json'), 'second')
  } finally {session.dispose()}
})

test('a replacement selection from an editing subscriber owns the final revision', () => {
  const {session, run, reply} = setup()
  try {
    let armed = true
    session.subscribe(state => {
      if (armed && state.state === 'editing') {
        armed = false
        session.select(new Map([['metadata.json', 'replacement']]))
      }
    })
    session.select(new Map([['metadata.json', 'outer selection']]))
    const worker = run()
    assert.equal(worker.request.files.get('metadata.json'), 'replacement')
    reply(worker, valid)
    assert.equal(session.continue().files.get('metadata.json'), 'replacement')
  } finally {session.dispose()}
})

test('disposal during an editing notification schedules no subsequent work', () => {
  const {session} = setup()
  let schedules = 0
  const original = globalThis.setTimeout
  session.subscribe(state => {if (state.state === 'editing') session.dispose()})
  try {
    globalThis.setTimeout = (...args) => {schedules++; return original(...args)}
    session.select(new Map([['metadata.json', 'selected']]))
    assert.equal(schedules, 0)
    assert.equal(session.snapshot().eligible, false)
  } finally {globalThis.setTimeout = original; session.dispose()}
})

test('unknown diagnostic buckets cannot authorize a worker result', () => {
  const {session, run, reply} = setup()
  try {
    session.select(new Map([['metadata.json', 'selected']]))
    const result = structuredClone(valid)
    result.report.issues.ALERT = [{message: 'Hidden error', severity: 40, location_description: null}]
    reply(run(), result)
    assert.equal(session.snapshot().state, 'incomplete')
    assert.equal(session.snapshot().eligible, false)
  } finally {session.dispose()}
})

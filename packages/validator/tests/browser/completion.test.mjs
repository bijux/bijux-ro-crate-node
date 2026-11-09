import assert from 'node:assert/strict'
import test from 'node:test'
import {reportOf} from '@bijux/ro-crate-core'
import {Session} from '../../src/browser/session.js'
import {isValidationResponse} from '../../src/worker/messages.js'

const valid = {status: 'valid', report: reportOf([])}
const files = () => new Map([['metadata.json', 'selected bytes']])
const values = [
  ['null', () => null], ['undefined', () => undefined], ['string', () => 'input rejected'],
  ['number', () => 42], ['zero', () => 0], ['false', () => false],
  ['symbol', () => Symbol('rejected')], ['empty string', () => ''], ['whitespace', () => ' \n '],
  ['empty error', () => new Error('')], ['null prototype', () => Object.create(null)],
  ['throwing message', () => ({get message() {throw null}})],
  ['throwing coercion', () => ({toString() {throw undefined}})],
  ['hostile message and coercion', () => ({get message() {throw null}, [Symbol.toPrimitive]() {throw undefined}})],
]
function incomplete(session) {
  const state = session.snapshot()
  assert.equal(state.state, 'incomplete')
  assert.equal(state.eligible, false)
  assert.equal(state.result.status, 'incomplete')
  assert.equal(typeof state.result.reason, 'string')
  assert.ok(state.result.reason.trim())
  assert.ok(isValidationResponse({session: state.session, revision: state.revision, id: 1, result: state.result}))
  assert.throws(() => session.continue(), /current revision/)
  return state
}
function worker() {
  return {terminations: 0, terminate() {this.terminations++}, postMessage(request) {this.request = request}}
}
function approve(session, workers) {
  session.select(files())
  session.revalidate()
  const current = workers.at(-1)
  current.onmessage({data: {...current.request, result: valid}})
  assert.equal(session.snapshot().eligible, true)
  assert.deepEqual(session.continue().files, files())
}

for (const [name, make] of values) for (const boundary of ['factory', 'selection options', 'option changes', 'file iterator']) {
  test(boundary + ' normalizes thrown ' + name + ' and permits a valid retry', () => {
    let fail = true
    const workers = [], value = make()
    const session = new Session({debounceMs: 1000, workerFactory: () => {
      if (fail && boundary === 'factory') throw value
      const created = worker(); workers.push(created); return created
    }})
    try {
      const options = {get contexts() {throw value}}
      assert.doesNotThrow(() => {
        if (boundary === 'factory') {session.select(files()); session.revalidate()}
        if (boundary === 'selection options') session.select(files(), options)
        if (boundary === 'option changes') {session.select(files()); session.updateOptions(options)}
        if (boundary === 'file iterator') session.select({*[Symbol.iterator]() {throw value}})
      })
      incomplete(session)
      fail = false
      approve(session, workers)
      assert.ok(workers.every(item => item.terminations === 1))
    } finally {session.dispose()}
  })
}

for (const kind of ['port', 'stream']) {
  test('uncloneable ' + kind + ' result stops once and stays terminal after the deadline', async () => {
    const workers = [], session = new Session({debounceMs: 1000, timeoutMs: 20, workerFactory: () => {
      const created = worker(); workers.push(created); return created
    }})
    const channel = new MessageChannel()
    try {
      session.select(files()); session.revalidate()
      const current = workers[0], callback = current.onmessage
      const result = {...valid, telemetry: kind === 'port' ? channel.port1 : new ReadableStream({start(controller) {controller.close()}})}
      const response = {...current.request, result}
      assert.ok(isValidationResponse(response))
      assert.doesNotThrow(() => callback({data: response}))
      const before = incomplete(session)
      assert.equal(current.terminations, 1)
      assert.equal(current.onmessage, null)
      await new Promise(resolve => setTimeout(resolve, 40))
      assert.deepEqual(incomplete(session), before)
      callback({data: {...current.request, result: valid}})
      assert.deepEqual(incomplete(session), before)
      approve(session, workers)
      session.dispose()
      assert.ok(workers.every(item => item.terminations === 1))
    } finally {session.dispose(); channel.port1.close(); channel.port2.close()}
  })
}

test('cloneable result extras remain detached inspection data', () => {
  const workers = [], session = new Session({debounceMs: 1000, workerFactory: () => {
    const created = worker(); workers.push(created); return created
  }})
  try {
    session.select(files()); session.revalidate()
    const result = {...valid, telemetry: {elapsed: 1}}
    workers[0].onmessage({data: {...workers[0].request, result}})
    result.telemetry.elapsed = 2
    const snapshot = session.snapshot()
    assert.equal(snapshot.result.telemetry.elapsed, 1)
    snapshot.result.telemetry.elapsed = 3
    assert.equal(session.continue().result.telemetry.elapsed, 1)
  } finally {session.dispose()}
})

for (const boundary of ['message', 'coercion']) for (const action of ['selection', 'disposal']) {
  test('failure ' + boundary + ' cannot overwrite reentrant ' + action, () => {
    const workers = []
    let session, fail = true
    const reenter = () => {
      fail = false
      if (action === 'disposal') session.dispose()
      else session.select(new Map([['replacement.json', 'replacement bytes']]))
      return 'superseded failure'
    }
    const value = boundary === 'message' ? {get message() {return reenter()}} : {[Symbol.toPrimitive]: reenter}
    session = new Session({debounceMs: 1000, workerFactory: () => {
      if (fail) throw value
      const created = worker(); workers.push(created); return created
    }})
    try {
      session.select(files()); session.revalidate()
      assert.equal(session.snapshot().eligible, false)
      if (action === 'disposal') assert.throws(() => session.revalidate(), /disposed/)
      else {
        assert.equal(session.snapshot().state, 'editing')
        session.revalidate()
        const current = workers.at(-1)
        current.onmessage({data: {...current.request, result: valid}})
        assert.deepEqual([...session.continue().files], [['replacement.json', 'replacement bytes']])
      }
    } finally {session.dispose()}
  })
}

import assert from 'node:assert/strict'
import test from 'node:test'
import {reportOf} from '@bijux/ro-crate-core'
import {Session} from '../../src/browser/session.js'

const selected = () => new Map([['metadata.json', 'selected bytes']])
const valid = {status: 'valid', report: reportOf([])}
function setup() {
  const workers = []
  const session = new Session({debounceMs: 1000, timeoutMs: 1000, workerFactory: () => {
    const worker = {terminate() {this.stopped = true}, postMessage(request) {this.request = request}}
    workers.push(worker)
    return worker
  }})
  session.select(selected())
  session.revalidate()
  return {session, workers}
}

const actions = {
  selection: session => session.select(new Map([['replacement.json', 'replacement bytes']])),
  edit: session => session.edit('metadata.json', 'edited bytes'),
  options: session => session.updateOptions({contexts: new Map()}),
  revalidation: session => session.revalidate(),
  cancellation: session => session.cancel(),
  disposal: session => session.dispose(),
}

for (const boundary of ['message', 'preventDefault']) for (const [name, act] of Object.entries(actions)) {
  test('worker error ' + boundary + ' preserves reentrant ' + name, () => {
    const {session, workers} = setup()
    try {
      const callback = workers[0].onerror
      let expected, calls = 0
      const reenter = () => {calls++; act(session); expected = session.snapshot()}
      const event = boundary === 'message'
        ? {preventDefault() {}, get message() {reenter(); return 'superseded worker error'}}
        : {preventDefault() {reenter()}, message: 'superseded worker error'}
      assert.doesNotThrow(() => callback(event))
      assert.equal(calls, 1)
      assert.deepEqual(session.snapshot(), expected)
      if (['cancellation', 'disposal'].includes(name)) return
      session.revalidate()
      const current = workers.at(-1)
      current.onmessage({data: {...current.request, result: valid}})
      assert.equal(session.snapshot().eligible, true)
      const expectedFiles = name === 'selection' ? new Map([['replacement.json', 'replacement bytes']]) :
        name === 'edit' ? new Map([['metadata.json', 'edited bytes']]) : selected()
      assert.deepEqual(session.continue().files, expectedFiles)
    } finally {session.dispose()}
  })
}

for (const boundary of ['message', 'preventDefault']) for (const value of [null, undefined, 0, 'worker error']) {
  test('worker error ' + boundary + ' contains thrown ' + String(value), () => {
    const {session, workers} = setup()
    try {
      const event = boundary === 'message'
        ? {preventDefault() {}, get message() {throw value}}
        : {preventDefault() {throw value}, message: 'unread error'}
      assert.doesNotThrow(() => workers[0].onerror(event))
      const state = session.snapshot()
      assert.equal(state.state, 'incomplete')
      assert.equal(state.eligible, false)
      assert.equal(typeof state.result.reason, 'string')
      assert.ok(state.result.reason.trim())
      assert.equal(workers[0].stopped, true)
      assert.throws(() => session.continue())
      session.revalidate()
      const current = workers.at(-1)
      current.onmessage({data: {...current.request, result: valid}})
      assert.deepEqual(session.continue().files, selected())
    } finally {session.dispose()}
  })
}

test('stale worker errors do not read callback properties or touch a new draft', () => {
  const {session, workers} = setup()
  try {
    const callback = workers[0].onerror
    actions.selection(session)
    const before = session.snapshot()
    let reads = 0
    callback({get preventDefault() {reads++; throw new Error('stale callback access')},
      get message() {reads++; throw new Error('stale message access')}})
    assert.equal(reads, 0)
    assert.deepEqual(session.snapshot(), before)
  } finally {session.dispose()}
})

for (const message of ['worker crashed', '', undefined]) test('ordinary worker failure retains message or fallback: ' + message, () => {
  const {session, workers} = setup()
  try {
    workers[0].onerror({message})
    assert.equal(session.snapshot().result.reason, message || 'Validation worker failed')
    assert.equal(session.snapshot().eligible, false)
  } finally {session.dispose()}
})

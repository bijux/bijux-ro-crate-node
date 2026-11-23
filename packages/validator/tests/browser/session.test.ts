import assert from 'node:assert/strict'
import test from 'node:test'
import {reportOf} from '@bijux/ro-crate-core'
import {Session} from '../../src/browser/session.js'

const valid = {status: 'valid', report: reportOf([])}
const invalid = {status: 'invalid', report: reportOf([{message: 'missing name', severity: 40, location_description: null}])}

interface TestWorker {
  terminated?: boolean
  terminations?: number
  request: {files: Map<string, string>; options: {contexts?: ReadonlyMap<string, unknown>}; revision: number}
  onmessage(event: {data: unknown}): void
  onerror(event: {message?: unknown}): void
}
function setup() {
  const workers: TestWorker[] = []
  const session = new Session({debounceMs: 1000, workerFactory: () => {
    const worker = {terminate() {this.terminated = true}, postMessage(request: TestWorker['request']) {this.request = request}} as TestWorker & Worker
    workers.push(worker)
    return worker
  }})
  const run = () => {session.revalidate(); return workers.at(-1)!}
  const reply = (worker: TestWorker, result: unknown) => worker.onmessage({data: {...worker.request, result}})
  return {session, workers, run, reply}
}

test('rejected draft text stays ineligible during revalidation and option changes', () => {
  const {session, workers, run, reply} = setup()
  try {
    session.select(new Map([['metadata.json', 'selected']]))
    reply(run(), valid)
    session.edit('metadata.json', '\ud800')
    for (const action of [() => session.revalidate(), () => {session.updateOptions({}); session.revalidate()}]) {
      assert.doesNotThrow(action)
      assert.equal(session.snapshot().state, 'incomplete')
      assert.equal((session.snapshot().result as {reason: string}).reason, 'Crate text contains an unpaired Unicode surrogate.')
      assert.equal(session.snapshot().eligible, false)
      assert.equal(workers.length, 1)
      assert.throws(() => session.continue(), /current revision/)
    }
    session.edit('metadata.json', 'repaired')
    reply(run(), valid)
    assert.equal(session.continue().files.get('metadata.json'), 'repaired')
  } finally {session.dispose()}
})

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
    ;(session.continue().files as Map<string, string>).set('metadata.json', 'caller mutation')
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
    assert.equal(workers.at(-1)!.request.files.get('metadata.json'), 'second')
    reply(workers.at(-1)!, valid)
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
    globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {schedules++; return original(...args)}) as typeof setTimeout
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
    ;(result.report.issues as Record<string, unknown>).ALERT = [{message: 'Hidden error', severity: 40, location_description: null}]
    reply(run(), result)
    assert.equal(session.snapshot().state, 'incomplete')
    assert.equal(session.snapshot().eligible, false)
  } finally {session.dispose()}
})

test('timer budgets reject overflow instead of silently scheduling an immediate deadline', () => {
  const workerFactory = () => {throw new Error('Construction must not start a worker')}
  for (const options of [
    {debounceMs: 2147483648}, {timeoutMs: 2147483648},
    {debounceMs: Infinity}, {timeoutMs: Infinity}, {debounceMs: NaN}, {timeoutMs: NaN},
    {debounceMs: -1}, {timeoutMs: 0}, {timeoutMs: -1},
  ]) assert.throws(() => new Session({workerFactory, ...options}), TypeError)
  for (const options of [
    {debounceMs: 0, timeoutMs: 1}, {debounceMs: 2147483647, timeoutMs: 2147483647},
    {debounceMs: 0.5, timeoutMs: 0.5},
  ]) {
    const session = new Session({workerFactory, ...options})
    assert.equal(session.snapshot().state, 'idle')
    session.dispose()
  }
})

for (const mode of ['scheduled selection', 'throw after selection', 'running selection']) {
  const throwAfterReselection = mode === 'throw after selection'
  test('a superseded worker factory preserves the newer ' + mode, async () => {
    const workers: TestWorker[] = []
    let session: Session, calls = 0, finish: (worker: TestWorker) => void, deadline: ReturnType<typeof setTimeout> | undefined
    const ready = new Promise<TestWorker>(resolve => {finish = resolve})
    session = new Session({debounceMs: 0, workerFactory: () => {
      if (++calls === 1) {
        session.select(new Map([['metadata.json', 'new selection']]))
        if (mode === 'running selection') session.revalidate()
        if (throwAfterReselection) throw new Error('Superseded factory failed')
      }
      const worker = {terminate() {this.terminated = true}, postMessage(request: TestWorker['request']) {this.request = request; finish(worker)}} as TestWorker & Worker
      workers.push(worker)
      return worker
    }})
    try {
      session.select(new Map([['metadata.json', 'old selection']]))
      session.revalidate()
      const worker = await Promise.race([ready, new Promise<never>((_, reject) => {
        deadline = setTimeout(() => reject(new Error('New selection did not start')), 1000)
      })])
      assert.equal(calls, 2)
      assert.equal(worker.request.files.get('metadata.json'), 'new selection')
      assert.ok(workers.filter(value => value !== worker).every(value => value.terminated))
      worker.onmessage({data: {...worker.request, result: valid}})
      assert.equal(session.continue().files.get('metadata.json'), 'new selection')
    } finally {clearTimeout(deadline); session.dispose()}
  })
}

for (const action of ['selection', 'edit', 'options', 'revalidation', 'cancel', 'completion', 'failure']) {
  test('a replacement from worker termination survives ' + action, () => {
    const workers: TestWorker[] = []
    let session: Session, armed = false, replaced = false
    session = new Session({debounceMs: 1000, timeoutMs: 100, workerFactory: () => {
      const worker = {
        postMessage(request: TestWorker['request']) {this.request = request},
        terminate() {
          this.terminations = (this.terminations ?? 0) + 1
          if (workers[0] === this && armed && !replaced) {
            replaced = true
            session.select(new Map([['metadata.json', 'replacement']]), {contexts: new Map([['https://example.org/replacement-context', {'@context': {}}]])})
            session.revalidate()
          }
        },
      } as TestWorker & Worker
      workers.push(worker)
      return worker
    }})
    try {
      session.select(new Map([['metadata.json', 'initial']]))
      session.revalidate()
      const original = workers[0], late = original.onmessage
      armed = true
      if (action === 'selection') session.select(new Map([['metadata.json', 'superseded']]))
      if (action === 'edit') session.edit('metadata.json', 'superseded')
      if (action === 'options') session.updateOptions({contexts: new Map([['https://example.org/superseded-context', {'@context': {}}]])})
      if (action === 'revalidation') session.revalidate()
      if (action === 'cancel') session.cancel()
      if (action === 'completion') original.onmessage({data: {...original.request, result: valid}})
      if (action === 'failure') original.onerror({message: 'deliberate worker failure'})
      assert.equal(workers.length, 2)
      const current = workers[1]
      assert.equal(original.terminations, 1)
      assert.equal(current.terminations ?? 0, 0)
      assert.equal(session.snapshot().state, 'validating')
      assert.equal(session.snapshot().revision, current.request.revision)
      late({data: {...original.request, result: valid}})
      assert.equal(session.snapshot().eligible, false)
      assert.throws(() => session.continue(), /current revision/)
      current.onmessage({data: {...current.request, result: valid}})
      assert.equal(session.continue().files.get('metadata.json'), 'replacement')
      assert.equal(session.continue().options.contexts!.has('https://example.org/replacement-context'), true)
    } finally {session.dispose()}
    assert.ok(workers.every(worker => worker.terminations === 1))
  })
}

test('disposal refuses selection from a terminating worker', () => {
  let session: Session, refused = false, terminations = 0, workers = 0
  session = new Session({debounceMs: 1000, timeoutMs: 100, workerFactory: () => {
    workers++
    return {postMessage() {}, terminate() {
      terminations++
      if (terminations === 1) {
        try {session.select(new Map([['metadata.json', 'replacement']])); session.revalidate()}
        catch (error) {refused = /disposed/.test((error as Error).message)}
      }
    }} as unknown as Worker
  }})
  try {
    session.select(new Map([['metadata.json', 'initial']]))
    session.revalidate()
    session.dispose()
    assert.equal(refused, true)
    assert.equal(workers, 1)
    assert.equal(terminations, 1)
    assert.equal(session.snapshot().eligible, false)
  } finally {session.dispose()}
})

for (const action of ['selection', 'options']) test('snapshot getters cannot overwrite a newer ' + action, () => {
  const {session, workers, run, reply} = setup()
  try {
    session.select(new Map([['metadata.json', 'initial']]))
    run()
    const options = {get contexts() {
      session.select(new Map([['metadata.json', 'replacement']]), {contexts: new Map([['https://example.org/replacement-context', {'@context': {}}]])})
      session.revalidate()
      return new Map([['https://example.org/superseded-context', {'@context': {}}]])
    }}
    if (action === 'selection') session.select(new Map([['metadata.json', 'superseded']]), options)
    else session.updateOptions(options)
    reply(workers.at(-1)!, valid)
    const checked = run()
    assert.equal(checked.request.files.get('metadata.json'), 'replacement')
    assert.equal(checked.request.options.contexts?.has('https://example.org/replacement-context'), true)
    reply(checked, valid)
  } finally {session.dispose()}
})

test('file iteration cannot overwrite a newer selection', () => {
  const {session, workers, run, reply} = setup()
  class Selection extends Map<string, string> {
    *[Symbol.iterator]() {
      session.select(new Map([['metadata.json', 'replacement']]))
      session.revalidate()
      yield* super[Symbol.iterator]()
      return undefined
    }
  }
  try {
    session.select(new Map([['metadata.json', 'initial']]))
    run()
    session.select(new Selection([['metadata.json', 'superseded']]))
    reply(workers.at(-1)!, valid)
    const checked = run()
    assert.equal(checked.request.files.get('metadata.json'), 'replacement')
    reply(checked, valid)
  } finally {session.dispose()}
})

test('sparse worker findings cannot approve a crate', () => {
  const {session, run, reply} = setup()
  try {
    session.select(new Map([['metadata.json', 'selected']]))
    const report = reportOf([])
    report.issues.INFO = new Array(1)
    report.highest_error_level = 'INFO'
    reply(run(), {status: 'valid', report})
    assert.equal(session.snapshot().state, 'incomplete')
    assert.equal(session.snapshot().eligible, false)
    assert.throws(() => session.continue(), /current revision/)
  } finally {session.dispose()}
})

test('an initial subscriber failure does not retain the failed registration', () => {
  const {session} = setup()
  let calls = 0
  try {
    assert.throws(() => session.subscribe(() => {calls++; throw new Error('initial observer failure')}), /initial observer failure/)
    assert.doesNotThrow(() => session.select(new Map([['metadata.json', 'selected']])))
    assert.equal(calls, 1)
  } finally {session.dispose()}
})

test('failed duplicate subscription preserves the earlier registration', () => {
  const {session} = setup()
  let calls = 0
  const listener = () => {calls++; if (calls === 2) throw new Error('duplicate failure')}
  try {
    const unsubscribe = session.subscribe(listener)
    assert.throws(() => session.subscribe(listener), /duplicate failure/)
    session.select(new Map([['metadata.json', 'selected']]))
    assert.equal(calls, 3)
    unsubscribe()
  } finally {session.dispose()}
})

test('failed initial delivery does not remove a reentrant replacement registration', () => {
  const {session} = setup()
  let calls = 0
  let unsubscribeReplacement = () => {}
  const listener = () => {
    calls++
    if (calls === 1) {
      const unsubscribe = session.subscribe(listener)
      unsubscribe()
      unsubscribeReplacement = session.subscribe(listener)
      throw new Error('original failure')
    }
  }
  try {
    assert.throws(() => session.subscribe(listener), /original failure/)
    session.select(new Map([['metadata.json', 'selected']]))
    assert.equal(calls, 4)
    unsubscribeReplacement()
  } finally {session.dispose()}
})

test('a throwing subscriber cannot hide eligibility revocation from another observer', t => {
  const {session, run, reply} = setup()
  const original = Object.getOwnPropertyDescriptor(globalThis, 'reportError')
  const reported: unknown[] = []
  Object.defineProperty(globalThis, 'reportError', {configurable: true, value: (error: unknown) => reported.push(error)})
  t.after(() => {if (original) Object.defineProperty(globalThis, 'reportError', original); else Reflect.deleteProperty(globalThis, 'reportError')})
  const failure = new Error('observer failed')
  let observed = session.snapshot()
  try {
    session.subscribe(state => {if (state.state === 'editing') throw failure})
    session.subscribe(state => {observed = state})
    assert.doesNotThrow(() => session.select(new Map([['metadata.json', 'selected']])))
    reply(run(), valid)
    assert.equal(observed.eligible, true)
    assert.doesNotThrow(() => session.edit('metadata.json', 'changed'))
    assert.equal(observed.eligible, false)
    assert.throws(() => session.continue(), /current revision/)
    assert.deepEqual(reported, [failure, failure])
    reply(run(), valid)
    assert.equal(session.continue().files.get('metadata.json'), 'changed')
  } finally {session.dispose()}
})

test('a reentrant throwing host reporter cannot restore a superseded selection', t => {
  const {session, workers, run, reply} = setup()
  const original = Object.getOwnPropertyDescriptor(globalThis, 'reportError')
  const originalConsole = console.error
  let reports = 0, fallback = 0, armed = true
  Object.defineProperty(globalThis, 'reportError', {configurable: true, value: () => {
    reports++
    session.select(new Map([['metadata.json', 'replacement']]))
    throw new Error('reporter failed')
  }})
  console.error = () => {fallback++}
  t.after(() => {console.error = originalConsole; if (original) Object.defineProperty(globalThis, 'reportError', original); else Reflect.deleteProperty(globalThis, 'reportError')})
  try {
    session.subscribe(state => {if (armed && state.state === 'editing') {armed = false; throw new Error('observer failed')}})
    assert.doesNotThrow(() => session.select(new Map([['metadata.json', 'superseded']])))
    const worker = run()
    assert.equal(workers.length, 1)
    assert.equal(worker.request.files.get('metadata.json'), 'replacement')
    reply(worker, valid)
    assert.equal(session.continue().files.get('metadata.json'), 'replacement')
    assert.equal(reports, 1)
    assert.equal(fallback, 1)
  } finally {session.dispose()}
})

test('a reentrant error reporter cannot recursively reenter itself', t => {
  const {session, run, reply} = setup()
  const original = Object.getOwnPropertyDescriptor(globalThis, 'reportError')
  const originalConsole = console.error
  let reports = 0, fallback = 0
  Object.defineProperty(globalThis, 'reportError', {configurable: true, value: () => {
    reports++
    session.select(new Map([['metadata.json', 'replacement']]))
  }})
  console.error = () => {fallback++}
  t.after(() => {console.error = originalConsole; if (original) Object.defineProperty(globalThis, 'reportError', original); else Reflect.deleteProperty(globalThis, 'reportError')})
  try {
    session.subscribe(state => {if (state.state === 'editing') throw new Error('observer failed')})
    assert.doesNotThrow(() => session.select(new Map([['metadata.json', 'superseded']])))
    const worker = run()
    assert.equal(worker.request.files.get('metadata.json'), 'replacement')
    reply(worker, valid)
    assert.equal(session.continue().files.get('metadata.json'), 'replacement')
    assert.equal(reports, 1)
    assert.equal(fallback, 1)
  } finally {session.dispose()}
})

test('a reporter that disposes the session does not notify disposed listeners', t => {
  const {session, workers} = setup()
  const original = Object.getOwnPropertyDescriptor(globalThis, 'reportError')
  Object.defineProperty(globalThis, 'reportError', {configurable: true, value: () => session.dispose()})
  t.after(() => {if (original) Object.defineProperty(globalThis, 'reportError', original); else Reflect.deleteProperty(globalThis, 'reportError')})
  let healthy = 0
  session.subscribe(state => {if (state.state === 'editing') throw new Error('observer failed')})
  session.subscribe(() => {healthy++})
  assert.doesNotThrow(() => session.select(new Map([['metadata.json', 'selected']])))
  assert.equal(healthy, 1)
  assert.equal(workers.length, 0)
  assert.throws(() => session.continue(), /disposed/)
})

test('a reentrant console fallback cannot recursively report listener failures', t => {
  const {session, run, reply} = setup()
  const original = Object.getOwnPropertyDescriptor(globalThis, 'reportError')
  const originalConsole = console.error
  let reports = 0
  Object.defineProperty(globalThis, 'reportError', {configurable: true, value: undefined})
  console.error = () => {reports++; if (reports < 4) session.select(new Map([['metadata.json', 'replacement']]))}
  t.after(() => {console.error = originalConsole; if (original) Object.defineProperty(globalThis, 'reportError', original); else Reflect.deleteProperty(globalThis, 'reportError')})
  try {
    session.subscribe(state => {if (state.state === 'editing') throw new Error('observer failed')})
    assert.doesNotThrow(() => session.select(new Map([['metadata.json', 'superseded']])))
    const worker = run()
    assert.equal(worker.request.files.get('metadata.json'), 'replacement')
    reply(worker, valid)
    assert.equal(session.continue().files.get('metadata.json'), 'replacement')
    assert.equal(reports, 1)
  } finally {session.dispose()}
})

test('cancel and revalidation remain usable after repeated observer failures', t => {
  const {session, run, reply} = setup()
  const original = Object.getOwnPropertyDescriptor(globalThis, 'reportError')
  const observed: string[] = []
  Object.defineProperty(globalThis, 'reportError', {configurable: true, value: () => {}})
  t.after(() => {if (original) Object.defineProperty(globalThis, 'reportError', original); else Reflect.deleteProperty(globalThis, 'reportError')})
  try {
    session.subscribe(state => {if (state.state !== 'idle') throw new Error('observer failed')})
    session.subscribe(state => observed.push(state.state))
    session.select(new Map([['metadata.json', 'selected']]))
    reply(run(), valid)
    session.edit('metadata.json', 'changed')
    session.cancel()
    assert.equal(session.snapshot().state, 'incomplete')
    assert.throws(() => session.continue(), /current revision/)
    reply(run(), valid)
    assert.equal(session.continue().files.get('metadata.json'), 'changed')
    assert.ok(observed.includes('incomplete'))
    assert.equal(observed.at(-1), 'valid')
  } finally {session.dispose()}
})

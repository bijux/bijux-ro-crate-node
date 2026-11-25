import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createDraft, applyChange} from '@bijux/ro-crate-creator'
import {ValidationCoordinator} from '../src/features/editor/validation/coordinator.ts'
import type {SessionSnapshot, ValidatedSnapshot, ValidationSession} from '@bijux/ro-crate-validator/browser'

class Session {
  state: SessionSnapshot = {session: 'initial', revision: 20, state: 'idle', eligible: false}
  files = new Map<string, string | Blob>()
  listener: (state: SessionSnapshot) => void = () => {}
  subscribe(listener: (state: SessionSnapshot) => void) {this.listener = listener; listener(this.state); return () => {this.listener = () => {}}}
  snapshot() {return this.state}
  cancel() {this.state = {...this.state, revision: this.state.revision + 1, state: 'incomplete', eligible: false}; this.listener(this.state)}
  select(files: ReadonlyMap<string, string | Blob>) {this.files = new Map(files); this.state = {session: crypto.randomUUID(), revision: this.state.revision + 1, state: 'editing', eligible: false}; this.listener(this.state)}
  approve() {this.state = {...this.state, state: 'valid', eligible: true}; this.listener(this.state)}
  continue(): ValidatedSnapshot {if (!this.state.eligible) throw Error('ineligible'); return {session: this.state.session, revision: this.state.revision, files: this.files, options: {}, result: {status: 'valid', report: {highest_error_level: null, issues: {ERROR: [], CRITICAL: [], WARNING: [], INFO: []}}} as unknown as ValidatedSnapshot['result']}}
  dispose() {this.cancel()}
}
function study() {const result = applyChange(createDraft(), {type: 'add-study'}); if (result.status !== 'applied') throw Error('study'); return result.draft}

test('replacement selection removes prior membership and immediately revokes approval', () => {
  const session = new Session()
  const coordinator = new ValidationCoordinator(session as unknown as ValidationSession)
  const draft = study()
  coordinator.update(draft, new Map([['a.tif', new Blob(['a'])]]))
  session.approve()
  assert.equal(coordinator.snapshot().eligible, true)
  coordinator.update(draft, new Map([['b.tif', new Blob(['b'])]]))
  assert.equal(coordinator.snapshot().eligible, false)
  assert.equal(session.files.has('a.tif'), false)
  assert.equal(session.files.has('b.tif'), true)
  assert.throws(() => coordinator.continue())
})

test('blocked materialization and obsolete responses cannot approve newer drafts', () => {
  const session = new Session()
  const coordinator = new ValidationCoordinator(session as unknown as ValidationSession)
  coordinator.update(study(), new Map())
  session.approve()
  const old = session.state
  coordinator.update(createDraft(), new Map())
  session.listener(old)
  assert.equal(coordinator.snapshot().eligible, false)
  assert.throws(() => coordinator.continue())
  coordinator.dispose()
})

test('continuation rechecks the session and returns its current snapshot', () => {
  const session = new Session()
  const coordinator = new ValidationCoordinator(session as unknown as ValidationSession)
  coordinator.update(study(), new Map([['image.tif', new Blob(['image'])]]))
  session.approve()
  const result = coordinator.continue()
  assert.equal(result.revision, session.state.revision)
  assert.equal(result.files.has('image.tif'), true)
  session.cancel()
  assert.throws(() => coordinator.continue())
  coordinator.dispose()
  assert.throws(() => coordinator.continue())
})

test('a reentrant update supersedes the older draft before selection', () => {
  const session = new Session()
  let coordinator: ValidationCoordinator
  let replace = false
  coordinator = new ValidationCoordinator(session as unknown as ValidationSession, status => {
    if (replace && status.state === 'editing') {replace = false; coordinator.update(createDraft(), new Map())}
  })
  replace = true
  coordinator.update(study(), new Map([['old.tif', new Blob()]]))
  assert.equal(coordinator.snapshot().state, 'blocked')
  assert.equal(session.files.has('old.tif'), false)
})

test('removed payload revokes approval while fresh validation remains available', () => {
  const session = new Session()
  const coordinator = new ValidationCoordinator(session as unknown as ValidationSession)
  let draft = study()
  function apply(change: Parameters<typeof applyChange>[1]) {const result = applyChange(draft, change); if (result.status !== 'applied') throw Error('change rejected'); draft = result.draft; return result.entityId}
  const dataset = apply({type: 'add-entity', kind: 'dataset'})
  const specimen = apply({type: 'add-entity', kind: 'specimen'})
  apply({type: 'add-file', file: {path: 'data/image.tif', size: '1', datasetId: dataset, specimenId: specimen, type: 'image'}})
  coordinator.update(draft, new Map([['data/image.tif', new Blob(['x'])]]))
  session.approve()
  assert.equal(coordinator.snapshot().eligible, true)
  coordinator.update(draft, new Map())
  assert.equal(coordinator.snapshot().state, 'editing')
  assert.throws(() => coordinator.continue())
  session.approve()
  assert.equal(coordinator.snapshot().eligible, true)
  assert.equal(coordinator.continue().files.has('data/image.tif'), false)
})

test('worker failure and disposal prevent stale approval', () => {
  const session = new Session()
  const coordinator = new ValidationCoordinator(session as unknown as ValidationSession)
  coordinator.update(study(), new Map())
  session.approve()
  const old = session.state
  session.state = {...old, state: 'incomplete', eligible: false}
  session.listener(session.state)
  assert.throws(() => coordinator.continue())
  coordinator.dispose()
  session.listener(old)
  assert.equal(coordinator.snapshot().eligible, false)
})

test('pending file listings immediately revoke and block validation', () => {
  const session = new Session()
  const coordinator = new ValidationCoordinator(session as unknown as ValidationSession)
  coordinator.update(study(), new Map())
  session.approve()
  coordinator.block('Assign or remove pending file listings before validation.')
  assert.equal(coordinator.snapshot().state, 'blocked')
  assert.throws(() => coordinator.continue())
})

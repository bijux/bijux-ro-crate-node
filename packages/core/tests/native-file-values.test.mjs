import assert from 'node:assert/strict'
import test from 'node:test'
import {runInNewContext} from 'node:vm'
import {createWorkspace, snapshotFiles} from '../src/index.js'

for (const expression of ['new Uint8Array([103,111,111,100])', 'new Uint8Array([103,111,111,100]).buffer']) {
  test('foreign native bytes are copied from storage: ' + expression, async () => {
    const foreign = runInNewContext(expression)
    const source = new Map([['metadata', foreign]])
    const workspace = createWorkspace(source), snapshot = snapshotFiles(source)
    const view = ArrayBuffer.isView(foreign) ? foreign : new Uint8Array(foreign)
    view.fill(0)
    assert.equal(await workspace.readText('metadata'), 'good')
    assert.equal(await createWorkspace(snapshot).readText('metadata'), 'good')
    assert.ok(snapshot.get('metadata') instanceof (ArrayBuffer.isView(foreign) ? Uint8Array : ArrayBuffer))
  })
}

for (const mode of ['zero', 'throws']) {
  test('Blob snapshots ignore caller size and reader overrides: ' + mode, async () => {
    let calls = 0
    class Input extends Blob {
      get size() {calls++; if (mode === 'throws') throw new Error('caller size'); return 0}
      get type() {calls++; throw new Error('caller type')}
      slice() {calls++; throw new Error('caller slice')}
      arrayBuffer() {calls++; throw new Error('caller reader')}
    }
    const value = new Input(['good'], {type: 'text/plain'})
    const files = new Map([['metadata', value]])
    const snapshot = snapshotFiles(files).get('metadata')
    assert.equal(calls, 0)
    assert.equal(snapshot.size, 4)
    assert.equal(snapshot.type, 'text/plain')
    assert.equal((await snapshot.arrayBuffer()).byteLength, 4)
    assert.equal(await snapshot.slice().text(), 'good')
    assert.equal(await createWorkspace(files).readText('metadata'), 'good')
    assert.equal(calls, 0)
  })
}

test('native recognition rejects fake brands, proxies and unsupported views', () => {
  for (const value of [null, {}, {[Symbol.toStringTag]: 'Blob'}, {[Symbol.toStringTag]: 'Uint8Array'},
    Object.create(Blob.prototype), new Proxy(new Uint8Array(4), {}),
    new DataView(new ArrayBuffer(4)), new Uint16Array(4)])
    assert.throws(() => snapshotFiles(new Map([['metadata', value]])), /Crate files must contain/)
})

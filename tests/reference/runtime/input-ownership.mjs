import assert from 'node:assert/strict'

/** Comparison authority belongs to exact registered input values and member order. */
export function registeredInputGuard(cases) {
  const freeze = value => {
    if (value && typeof value === 'object') {Object.values(value).forEach(freeze); Object.freeze(value)}
    return value
  }
  // Assertion errors can expose their expected value to callers too.
  const registered = new Map(cases.map(item => [item.name, freeze(structuredClone(item))]))
  assert.equal(registered.size, cases.length, 'Reference input names repeat')
  return item => {
    const stored = registered.get(item.name)
    assert.ok(stored, 'Unregistered reference input: ' + item.name)
    assert.deepEqual(item, stored, 'Reference input differs from its registration')
    assert.equal(JSON.stringify(item), JSON.stringify(stored), 'Reference input member order differs')
  }
}

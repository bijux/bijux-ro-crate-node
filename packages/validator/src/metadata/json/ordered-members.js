const orders = new WeakMap()
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key)

/** Keep Python's first-insertion key order, including numeric-looking names. */
export const sourceKeys = object => orders.get(object) ?? Object.keys(object)

/** Preserve native parsing/reviver behavior and retain only member provenance. */
export function parseJSONWithOrder(source, reviver) {
  const result = JSON.parse(source, reviver)
  let offset = 0
  const stack = []
  const whitespace = () => {while (/[ \t\r\n]/.test(source[offset] ?? '')) offset++}
  function string(decode = false) {
    const start = offset++
    while (source[offset] !== '"') offset += source[offset] === '\\' ? 2 : 1
    offset++
    return decode ? JSON.parse(source.slice(start, offset)) : undefined
  }
  function value(parsed) {
    whitespace()
    if (source[offset] === '{') {
      offset++
      const object = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
      stack.push({object, keys: new Set()})
    } else if (source[offset] === '[') {
      offset++
      stack.push({array: Array.isArray(parsed) ? parsed : null, index: 0})
    } else if (source[offset] === '"') string()
    else while (offset < source.length && !/[ \t\r\n,}\]]/.test(source[offset])) offset++
  }
  // Native parsing already validated the grammar. An explicit stack avoids
  // adding a recursion limit to serialized context documents.
  value(result)
  while (stack.length) {
    whitespace()
    const frame = stack.at(-1)
    if (source[offset] === '}' || source[offset] === ']') {
      offset++; stack.pop()
      if (frame.object) orders.set(frame.object, Object.freeze([...frame.keys]))
      continue
    }
    if (source[offset] === ',') {offset++; whitespace()}
    if (frame.keys) {
      const key = string(true)
      frame.keys.add(key)
      whitespace(); offset++
      // Duplicate members visit the final parsed child again. Its last
      // value's nested provenance replaces earlier discarded occurrences.
      value(frame.object && own(frame.object, key) ? frame.object[key] : undefined)
    } else value(frame.array?.[frame.index++])
  }
  return result
}

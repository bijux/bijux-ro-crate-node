import {floatText, isFloatAt} from './number-kinds.js'

const escapes = new Map([['"', '\\"'], ['\\', '\\\\'], ['\b', '\\b'], ['\f', '\\f'], ['\n', '\\n'], ['\r', '\\r'], ['\t', '\\t']])
const quote = text => '"' + text.replace(/["\\\x00-\x1f]/g, character => escapes.get(character) ?? '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0')) + '"'
const compareKeys = (left, right) => {
  const a = Array.from(left, c => c.codePointAt(0)), b = Array.from(right, c => c.codePointAt(0))
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]
  return a.length - b.length
}

/** RDFLib's locked JSON serializer retains Python numeric kinds and key order. */
export function jsonLiteralText(value, parent, key) {
  if (value === null) return 'null'
  if (typeof value === 'string') return quote(value)
  if (typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return Number.isNaN(value) ? 'NaN' : value < 0 ? '-Infinity' : 'Infinity'
    return isFloatAt(parent, key) || !Number.isInteger(value) ? floatText(value) : String(value)
  }
  if (Array.isArray(value)) return '[' + value.map((child, index) => jsonLiteralText(child, value, index)).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort(compareKeys)
    .map(name => quote(name) + ':' + jsonLiteralText(value[name], value, name)).join(',') + '}'
  throw new TypeError('Unsupported JSON literal value')
}

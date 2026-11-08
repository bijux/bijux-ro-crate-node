import {recordFloat} from './number-kinds.js'

const integer = /^-?\d+$/

export function parseMetadata(text) {
  // CPython's JSON reader accepts these non-finite constants. Replace only
  // bare value tokens; quoted text, keys and malformed JSON stay untouched.
  let marker = 'urn:bijux:json-number:'
  while (text.includes(marker)) marker += '-'
  const constants = new Map()
  text = text.replace(/"(?:[^"\\]|\\[\s\S])*"|(-?Infinity|NaN)/g, (token, constant, offset, source) => {
    if (!constant) return token
    let before = offset - 1, after = offset + token.length
    while (/[ \t\r\n]/.test(source[before] ?? '')) before--
    while (/[ \t\r\n]/.test(source[after] ?? '')) after++
    if ((before >= 0 && !/[:\[,]/.test(source[before])) ||
        (after < source.length && !/[,}\]]/.test(source[after]))) return token
    const key = marker + constant
    constants.set(key, constant === 'NaN' ? NaN : constant === 'Infinity' ? Infinity : -Infinity)
    return JSON.stringify(key)
  })
  return JSON.parse(text, function (key, value, context) {
    if (typeof value === 'string' && constants.has(value)) {
      recordFloat(this, key)
      return constants.get(value)
    }
    if (typeof value === 'number' && typeof context?.source !== 'string')
      throw new TypeError('This runtime cannot retain JSON numeric token identity')
    if (typeof value === 'number' && /[.eE]/.test(context?.source ?? '')) recordFloat(this, key)
    if (typeof value !== 'number' || Number.isSafeInteger(value))
      return Object.is(value, -0) && integer.test(context?.source ?? '') ? 0 : value
    const source = context?.source
    if (source && integer.test(source)) {
      // CPython's default JSON integer conversion also bounds decimal digits.
      if (source.replace('-', '').length > 4300) throw new Error('Metadata integer exceeds the reference digit limit')
      return BigInt(source)
    }
    return value
  })
}

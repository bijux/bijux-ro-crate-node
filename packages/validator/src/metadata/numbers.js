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
  return JSON.parse(text, (_key, value, context) => {
    if (typeof value === 'string' && constants.has(value)) return constants.get(value)
    if (typeof value !== 'number' || Number.isSafeInteger(value)) return value
    const source = context?.source
    if (source && integer.test(source)) {
      // CPython's default JSON integer conversion also bounds decimal digits.
      if (source.replace('-', '').length > 4300) throw new Error('Metadata integer exceeds the reference digit limit')
      return BigInt(source)
    }
    if (Number.isInteger(value) && !source) throw new Error('This runtime cannot retain JSON integer precision')
    return value
  })
}

export function jsonldValue(value, key) {
  if (typeof value === 'bigint') return key === '@value' ? String(value) :
    {'@value': String(value), '@type': 'http://www.w3.org/2001/XMLSchema#integer'}
  if (Array.isArray(value)) return value.map(item => jsonldValue(item))
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).map(([name, child]) => [name, jsonldValue(child, name)]))
  return value
}

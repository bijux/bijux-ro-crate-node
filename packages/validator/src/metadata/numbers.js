const integer = /^-?\d+$/

export function parseMetadata(text) {
  return JSON.parse(text, (_key, value, context) => {
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

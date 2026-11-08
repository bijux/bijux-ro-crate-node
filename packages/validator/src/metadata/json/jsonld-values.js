export function jsonldValue(value, key) {
  if (typeof value === 'bigint') return key === '@value' ? String(value) :
    {'@value': String(value), '@type': 'http://www.w3.org/2001/XMLSchema#integer'}
  if (Array.isArray(value)) return value.map(item => jsonldValue(item))
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).map(([name, child]) => [name, jsonldValue(child, name)]))
  return value
}

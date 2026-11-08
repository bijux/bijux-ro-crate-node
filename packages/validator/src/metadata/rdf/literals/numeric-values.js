const XSD = 'http://www.w3.org/2001/XMLSchema#'
const receipts = new WeakMap()
const constructorValues = new WeakMap()
const integerTypes = new Set(['integer', 'nonPositiveInteger', 'long', 'nonNegativeInteger', 'negativeInteger',
  'int', 'unsignedLong', 'positiveInteger', 'short', 'unsignedInt', 'byte', 'unsignedShort', 'unsignedByte'])

/** Retain constructor values on the first equal quad, not unrelated equal terms. */
export function withNumericValues(quads, values) {
  receipts.set(quads, new WeakMap(values))
  return quads
}

/** Resolve zero/one restriction values using the RDFLib constructor, not text alone. */
export function copyNumericValue(quads, source, target) {
  constructorValues.set(target, referenceCardinalityValue(quads, source.object, source))
  return target
}

export function referenceCardinalityValue(quads, term, quad) {
  if (constructorValues.has(term)) return constructorValues.get(term)
  const stored = receipts.get(quads)
  if (quad && stored?.has(quad)) return stored.get(quad)
  if (term.termType !== 'Literal' || term.language || !term.datatype.value.startsWith(XSD)) return undefined
  const type = term.datatype.value.slice(XSD.length)
  if (type === 'boolean') return term.value === 'true' ? 1 : 0
  if (integerTypes.has(type)) return /^[+-]?\d+$/.test(term.value) ? Number(term.value) : undefined
  if (type === 'decimal') {
    if (/^[+-]?0+(?:\.0+)?$/.test(term.value)) return 0
    if (/^\+?0*1(?:\.0+)?$/.test(term.value)) return 1
    return undefined
  }
  if (['float', 'double'].includes(type) &&
      /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(term.value)) return Number(term.value)
  return undefined
}

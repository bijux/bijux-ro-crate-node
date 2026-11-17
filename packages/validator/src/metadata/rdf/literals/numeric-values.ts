interface RDFTerm { termType: string; value: string; language?: string; datatype?: {value: string} }
interface Quad { object: RDFTerm }
// A copied target has a constructor value in the private WeakMap.
declare const numericReceipt: unique symbol
type RetainedNumericValue = {readonly [numericReceipt]: true}

const XSD = 'http://www.w3.org/2001/XMLSchema#'
const receipts = new WeakMap<object, WeakMap<object, number | undefined>>()
const constructorValues = new WeakMap<object, number | undefined>()
const integerTypes = new Set(['integer', 'nonPositiveInteger', 'long', 'nonNegativeInteger', 'negativeInteger',
  'int', 'unsignedLong', 'positiveInteger', 'short', 'unsignedInt', 'byte', 'unsignedShort', 'unsignedByte'])

/** Retain constructor values on the first equal quad, not unrelated equal terms. */
export function withNumericValues<T extends object>(quads: T, values: Iterable<readonly [object, number | undefined]>): T {
  receipts.set(quads, new WeakMap(values))
  return quads
}

/** Resolve zero/one restriction values using the RDFLib constructor, not text alone. */
export function copyNumericValue<T extends object>(quads: object, source: Quad, target: T): T & RetainedNumericValue {
  constructorValues.set(target, referenceCardinalityValue(quads, source.object, source))
  return target as T & RetainedNumericValue
}

export function referenceCardinalityValue(quads: object, term: RDFTerm | RetainedNumericValue, quad?: object) {
  if (constructorValues.has(term)) return constructorValues.get(term)
  const stored = receipts.get(quads)
  if (quad && stored?.has(quad)) return stored.get(quad)
  if ((term as RDFTerm).termType !== 'Literal' || (term as RDFTerm).language || !(term as RDFTerm).datatype!.value.startsWith(XSD)) return undefined
  const type = (term as RDFTerm).datatype!.value.slice(XSD.length)
  if (type === 'boolean') return (term as RDFTerm).value === 'true' ? 1 : 0
  if (integerTypes.has(type)) return /^[+-]?\d+$/.test((term as RDFTerm).value) ? Number((term as RDFTerm).value) : undefined
  if (type === 'decimal') {
    if (/^[+-]?0+(?:\.0+)?$/.test((term as RDFTerm).value)) return 0
    if (/^\+?0*1(?:\.0+)?$/.test((term as RDFTerm).value)) return 1
    return undefined
  }
  if (['float', 'double'].includes(type) &&
      /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test((term as RDFTerm).value)) return Number((term as RDFTerm).value)
  return undefined
}

const floatingKeys = new WeakMap<object, Set<string>>()

export function recordFloat(container: object, key: string | number) {
  if (!floatingKeys.has(container)) floatingKeys.set(container, new Set())
  floatingKeys.get(container)!.add(String(key))
}

// WeakMap.get accepts undefined at runtime and returns undefined for that key.
export const isFloatAt = (container: object | undefined, key: string | number | undefined) => floatingKeys.get(container as object)?.has(String(key)) ?? false

export function floatText(value: number) {
  if (Number.isNaN(value)) return 'nan'
  if (!Number.isFinite(value)) return value < 0 ? '-inf' : 'inf'
  if (Object.is(value, -0)) return '-0.0'
  if (value && (Math.abs(value) >= 1e16 || Math.abs(value) < 1e-4))
    return value.toExponential().replace(/e([+-])(\d)$/, 'e$10$2')
  return Number.isInteger(value) ? value + '.0' : String(value)
}

// Model coercion still receives primitive numbers. Only RDF conversion uses
// immutable boxes to carry the native numeric kind through JSON-LD expansion.
export class RDFNumber extends Number {
  declare readonly floating: boolean
  declare readonly lexical: string
  declare readonly datatype: string | undefined
  constructor(value: number | bigint, floating: boolean, datatype: string | undefined) {
    super(Number(value))
    this.floating = floating
    this.lexical = floating ? floatText(Number(value)) : String(value)
    this.datatype = datatype
    Object.freeze(this)
  }
  toString() {return this.lexical}
}

export class RDFJSON extends String {
  constructor(lexical: string) {super(lexical); Object.freeze(this)}
}

import Decimal from 'decimal.js'
import {DOMParser} from '@xmldom/xmldom'
import {numericLiteral} from '../../metadata/rdf/literals/numeric.js'
import {RDF} from './dataset.js'
/** These converter failures are not recorded as OWL error messages upstream. */
export class UnrecordedDatatypeConversion extends Error {}

const XSD = 'http://www.w3.org/2001/XMLSchema#'
const bounds = {
  byte: [-129n, 128n], short: [-32769n, 32768n], int: [-2147483649n, 2147483648n],
  long: [-9223372036854775809n, 9223372036854775808n], unsignedByte: [-1n, 256n],
  unsignedShort: [-1n, 65536n], unsignedInt: [-1n, 4294967296n], unsignedLong: [-1n, 18446744073709551616n],
  positiveInteger: [0n, null], nonPositiveInteger: [null, 1n], nonNegativeInteger: [-1n, null], negativeInteger: [null, 0n],
}
const word = '[\\p{L}\\p{N}_]'
const calendar = (year, month, day) => {
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) return false
  const date = new Date(0); date.setUTCFullYear(year, month - 1, day)
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}
function temporal(text, type) {
  if (!text.length) throw new UnrecordedDatatypeConversion('Empty temporal value raises IndexError upstream')
  let zone = false
  if (text.endsWith('Z')) {zone = true; text = text.slice(0, -1)}
  else if (/.*[+-][0-9]{2}:[0-9]{2}/.test(text)) {zone = true; text = text.slice(0, -6)}
  if (type === 'dateTimeStamp' && !zone) return false
  if (type === 'date') {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text)
    return !!m && calendar(...m.slice(1).map(Number))
  }
  let date = true
  if (type !== 'time') {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})T/.exec(text)
    if (!m) return false
    date = calendar(...m.slice(1).map(Number)); text = text.slice(m[0].length)
  }
  const m = /^(\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.(\d+))?$/.exec(text)
  return date && !!m && Number(m[1]) < 24 && Number(m[2]) < 60 && Number(m[3]) < 60 && Number(m[4] ?? 0) < 1000000
}

/** ValueError checks performed once by the locked OWL datatype converters. */
export function datatypeLexicalError(term) {
  const value = term.value, datatype = term.datatype.value
  if (datatype === RDF + 'XMLLiteral') {
    try {
      const doc = new DOMParser({onError() {throw new Error('Invalid XML')}}).parseFromString(value, 'application/xml')
      return !doc.documentElement
    } catch {return true}
  }
  if (datatype === RDF + 'PlainLiteral') {
    const m = /^(.*)@([^@]*)/.exec(value)
    return !m || (m[2] !== '' && !/^[a-zA-Z]{1,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(m[2]))
  }
  if (!datatype.startsWith(XSD)) return false
  const type = datatype.slice(XSD.length)
  if (type === 'boolean') return !/^(?:true|false|0|1)$/i.test(value)
  if (type === 'integer' || bounds[type]) {
    const text = numericLiteral(value, 'integer')
    if (!/^[+-]?\d+$/.test(text)) return true
    const integer = BigInt(text), [lower, upper] = bounds[type] ?? [null, null]
    return (lower !== null && integer <= lower) || (upper !== null && integer >= upper)
  }
  if (['decimal', 'float', 'double'].includes(type)) {
    if (type === 'decimal' && /e/i.test(value)) return true
    if (type === 'decimal' && /^[+-]?s?nan\d*$/i.test(value)) return false
    let parsed
    try {parsed = new Decimal(value.replaceAll('_', ''))} catch (error) {
      if (type === 'decimal') {
        if (error instanceof Error && error.message.startsWith('[DecimalError] Invalid argument:'))
          throw new UnrecordedDatatypeConversion('Invalid decimal raises InvalidOperation upstream')
        throw error
      }
      return true
    }
    if (type === 'decimal') return false
    const exponent = type === 'float' ? [40, -50] : [310, -330]
    return !parsed.abs().gt(new Decimal('1e' + exponent[1])) || !parsed.abs().lt(new Decimal('1e' + exponent[0]))
  }
  if (type === 'anyURI') {
    if (!value || /^[a-z][a-z\d+.-]*:/i.test(value)) return false
    return /^[?:]/.test(value) || (value.startsWith('%') && !/^%[a-f\d]{2}/i.test(value))
  }
  if (type === 'base64Binary') {
    if (!/^[\p{L}\p{N}+/=]+$/u.test(value) || /[^\x00-\x7f]/.test(value)) return true
    const data = value.replace(/=+$/, '')
    const padding = value.length - data.length
    return data.includes('=') || data.length % 4 === 1 || (data.length % 4 !== 0 && padding < 4 - data.length % 4)
  }
  if (type === 'hexBinary') {
    const text = value.trim().replace(/^[+-]/, '').replace(/^0x/i, '')
    return !/^[a-f\d](?:_?[a-f\d])*$/i.test(text)
  }
  if (['date', 'time', 'dateTime', 'dateTimeStamp'].includes(type)) return !temporal(value, type)
  if (type === 'language') return !/^[a-zA-Z]{1,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(value)
  if (['NMTOKEN', 'Name', 'NCName'].includes(type)) {
    const pattern = type === 'NCName' ? `^(?:${word}|[.\\-])+$` : `^(?:${word}|[:.\\-])+$`
    return !new RegExp(pattern, 'u').test(value) || (type !== 'NMTOKEN' && /^[.\-0-9]/.test(value))
  }
  if (type === 'normalizedString') return !value.length || /[\n\t\r]/.test(value)
  if (type === 'token') return /[\n\t\r]/.test(value) || value.trim().split(/\s+/).join(' ').length !== value.length
  return false
}

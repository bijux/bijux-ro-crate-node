import {invalidURIAuthority} from '../../metadata/rdf/uri-authority.js'
import Decimal from 'decimal.js'
import {DOMParser} from '@xmldom/xmldom'
import {numericLiteral} from '../../metadata/rdf/literals/numeric.js'
import {RDF} from './dataset.js'
import datatypes from './datatypes.json' with {type: 'json'}
import digitData from '../../metadata/rdf/literals/decimal-digits.json' with {type: 'json'}
import {isPythonWordCharacter} from '../../metadata/rdf/unicode-names.js'
/** These converter failures are not recorded as OWL error messages upstream. */
export class UnrecordedDatatypeConversion extends Error {}

const XSD = 'http://www.w3.org/2001/XMLSchema#'
const bounds = {
  byte: [-129n, 128n], short: [-32769n, 32768n], int: [-2147483649n, 2147483648n],
  long: [-9223372036854775809n, 9223372036854775808n], unsignedByte: [-1n, 256n],
  unsignedShort: [-1n, 65536n], unsignedInt: [-1n, 4294967296n], unsignedLong: [-1n, 18446744073709551616n],
  positiveInteger: [0n, null], nonPositiveInteger: [null, 1n], nonNegativeInteger: [-1n, null], negativeInteger: [null, 0n],
}
const decimalDigits = new Map(digitData.zero_points.flatMap(zero =>
  Array.from({length: 10}, (_, digit) => [String.fromCodePoint(zero + digit), String(digit)])))
const digits = text => Array.from(text, char => decimalDigits.get(char) ?? char).join('')
const integerWhitespace = text => text.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, '')
const pythonWhitespace = '[\\p{White_Space}\\x1c-\\x1f]'
const decimalText = value => digits(value.replaceAll('_', '').replace(new RegExp('^' + pythonWhitespace + '+|' + pythonWhitespace + '+$', 'gu'), ''))
const decimalSyntax = text => /^[+-]?(?:(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:e[+-]?[0-9]+)?|inf(?:inity)?|s?nan[0-9]*)$/i.test(text)
const calendar = (year, month, day) => {
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) return false
  const date = new Date(0); date.setUTCFullYear(year, month - 1, day)
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}
const decimalPattern = '[' + digitData.zero_points.map(zero =>
  '\\u{' + zero.toString(16) + '}-\\u{' + (zero + 9).toString(16) + '}').join('') + ']'
const temporalPatterns = Object.fromEntries(Object.entries(datatypes.strptime_patterns).map(([name, pattern]) =>
  [name, new RegExp('^(?:' + pattern.replaceAll('(?P<', '(?<').replaceAll('\\d', decimalPattern) + ')(?![\\s\\S])', 'iu')]))

function temporal(text, type) {
  if (!text.length) throw new UnrecordedDatatypeConversion('Empty temporal value raises IndexError upstream')
  let zone = false
  if (text.endsWith('Z')) {zone = true; text = text.slice(0, -1)}
  else if (/^[^\n]*[+-][0-9]{2}:[0-9]{2}/.test(text)) {zone = true; text = text.slice(0, -6)}
  if (type === 'dateTimeStamp' && !zone) return false
  let micros = 0
  if (type !== 'date') {
    // The converter reads the last dot and its numeric prefix; its suffix is
    // intentionally not required to be consumed by the pinned regex.
    const fraction = /^([^\n]*)\.([0-9]*)/.exec(text)
    if (fraction) {
      if (!fraction[2] || fraction[2].length > 4300) return false
      micros = Number(fraction[2]); text = fraction[1]
    }
  }
  const format = type === 'dateTimeStamp' ? 'dateTime' : type
  const match = temporalPatterns[format].exec(text)
  if (!match) return false
  const part = Object.fromEntries(Object.entries(match.groups).map(([key, value]) => [key, Number(digits(value))]))
  return (type === 'time' || calendar(part.Y, part.m, part.d)) &&
    (type === 'date' || (part.H < 24 && part.M < 60 && part.S < 60 && micros < 1000000))
}

function invalidURI(value) {
  if (!value) return false
  let url = value.replace(/^[\x00-\x20]+/, '').replace(/[\t\n\r]/g, '')
  const scheme = /^[a-z][a-z0-9+.-]*:/i.exec(url)
  if (scheme) url = url.slice(scheme[0].length)
  if (url.startsWith('//')) {
    if (invalidURIAuthority(url.slice(2).split(/[/?#]/, 1)[0])) return true
  }
  if (scheme) return false
  return /^[?:]/.test(value) || (value.startsWith('%') && !/^%[a-f0-9]{2}/i.test(value))
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
    const m = /^([^\n]*)@([^@]*)/.exec(value)
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
    const text = decimalText(value)
    if (!decimalSyntax(text)) {
      if (type === 'decimal') throw new UnrecordedDatatypeConversion('Invalid decimal raises InvalidOperation upstream')
      return true
    }
    if (type === 'decimal') return false
    // Python Decimal rejects radix-prefixed strings accepted by decimal.js.
    if (/nan|inf/i.test(text)) return true
    const parsed = new Decimal(text)
    const exponent = type === 'float' ? [40, -50] : [310, -330]
    return !parsed.abs().gt(new Decimal('1e' + exponent[1])) || !parsed.abs().lt(new Decimal('1e' + exponent[0]))
  }
  if (type === 'anyURI') return invalidURI(value)
  if (type === 'base64Binary') {
    if (!/^[\p{L}\p{N}+/=]+$/u.test(value) || /[^\x00-\x7f]/.test(value)) return true
    const data = value.replace(/=+$/, '')
    const padding = value.length - data.length
    return data.includes('=') || data.length % 4 === 1 || (data.length % 4 !== 0 && padding < 4 - data.length % 4)
  }
  if (type === 'hexBinary') {
    const text = digits(integerWhitespace(value))
    return !/^[+-]?(?:0x_?)?[a-f0-9](?:_?[a-f0-9])*$/i.test(text)
  }
  if (['date', 'time', 'dateTime', 'dateTimeStamp'].includes(type)) return !temporal(value, type)
  if (type === 'language') return !/^[a-zA-Z]{1,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(value)
  if (['NMTOKEN', 'Name', 'NCName'].includes(type)) {
    const punctuation = type === 'NCName' ? '._-' : ':._-'
    return !value.length || Array.from(value).some(char => !isPythonWordCharacter(char) && !punctuation.includes(char)) ||
      (type !== 'NMTOKEN' && /^[.\-0-9]/.test(value))
  }
  if (type === 'normalizedString') return !value.length || /[\n\t\r]/.test(value)
  if (type === 'token') return /[\n\t\r]/.test(value) || value.replace(new RegExp('^' + pythonWhitespace + '+|' + pythonWhitespace + '+$', 'gu'), '').split(new RegExp(pythonWhitespace + '+', 'u')).join(' ').length !== value.length
  return false
}

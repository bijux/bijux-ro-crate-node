import digitData from './decimal-digits.json' with {type: 'json'}
import {floatText} from '../../json/number-kinds.js'

const integers = new Set(['integer', 'nonPositiveInteger', 'long', 'nonNegativeInteger', 'negativeInteger',
  'int', 'unsignedLong', 'positiveInteger', 'short', 'unsignedInt', 'byte', 'unsignedShort', 'unsignedByte'])
const digits = new Map(digitData.zero_points.flatMap(zero =>
  Array.from({length: 10}, (_, digit) => [String.fromCodePoint(zero + digit), String(digit)])))
const decimalDigits = text => text.replace(/[\s\S]/gu, character => digits.get(character) ?? character)

function decimalText(text) {
  const special = /^([+-]?)(s?nan)([0-9]*)$/i.exec(text)
  if (special) return (special[1] === '-' ? '-' : '') +
    (special[2].toLowerCase().startsWith('s') ? 'sNaN' : 'NaN') + special[3].replace(/^0+/, '')
  if (/^[+-]?inf(?:inity)?$/i.test(text)) return text.startsWith('-') ? '-Infinity' : 'Infinity'
  const match = /^([+-]?)([0-9]*)(?:\.([0-9]*))?(?:e([+-]?[0-9]+))?$/i.exec(text)
  if (!match || !(match[2] || match[3])) return null
  const exponent = BigInt(match[4] ?? 0)
  const digits = (match[2] + (match[3] ?? '')).replace(/^0+/, '') || '0'
  if (exponent < -1999999999999999997n || exponent > 999999999999999999n ||
      (digits !== '0' && exponent + BigInt(digits.length - 1) > 999999999999999999n)) return null
  const places = (match[3]?.length ?? 0) - Number(exponent)
  const sign = match[1] === '-' ? '-' : ''
  if (digits === '0' && places <= 0) return sign + '0'
  if (!Number.isSafeInteger(places)) throw new RangeError('Decimal literal exceeds platform string capacity')
  if (places <= 0) return sign + digits + '0'.repeat(-places)
  if (places < digits.length) return sign + digits.slice(0, -places) + '.' + digits.slice(-places)
  return sign + '0.' + '0'.repeat(places - digits.length) + digits
}

/** Retain Python numeric parsing, normalization and conversion limits. */
export function numericLiteral(value, type) {
  if (!integers.has(type) && !['float', 'double', 'decimal'].includes(type)) return undefined
  const numeric = decimalDigits(value.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, ''))
  if (integers.has(type)) {
    const digits = numeric.replace(/^[+-]/, '').replaceAll('_', '')
    return /^[+-]?[0-9](?:_?[0-9])*$/.test(numeric) && digits.length <= 4300 ? String(BigInt(numeric.replaceAll('_', ''))) : value
  }
  if (type === 'decimal') {
    const text = decimalDigits(value.replace(/^[\p{White_Space}\x1c-\x1f]+|[\p{White_Space}\x1c-\x1f]+$/gu, '')).replaceAll('_', '')
    return decimalText(text) ?? value
  }
  const text = numeric.replaceAll('_', '')
  if (/(?:^_|_$|[^0-9]_|_[^0-9])/.test(numeric) || !/^[+-]?(?:(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:e[+-]?[0-9]+)?|inf(?:inity)?|nan)$/i.test(text)) return value
  return floatText(/inf/i.test(text) ? (text.startsWith('-') ? -Infinity : Infinity) : Number(text))
}

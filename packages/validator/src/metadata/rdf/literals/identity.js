import {canonicalLiteral} from './canonical.js'
const XSD = 'http://www.w3.org/2001/XMLSchema#'
const integers = new Set(['integer', 'nonPositiveInteger', 'long', 'nonNegativeInteger', 'negativeInteger',
  'int', 'unsignedLong', 'positiveInteger', 'short', 'unsignedInt', 'byte', 'unsignedShort', 'unsignedByte'])

function decimalDigits(text) {
  return text.replace(/\p{Decimal_Number}/gu, digit => {
    const point = digit.codePointAt(0)
    let start = point
    while (start > 0 && /\p{Decimal_Number}/u.test(String.fromCodePoint(start - 1))) start--
    return String((point - start) % 10)
  })
}

function decimal(text) {
  const special = /^([+-]?)(s?nan)([0-9]*)$/i.exec(text)
  if (special) return ['special', (special[1] === '-' ? '-' : '') +
    (special[2].toLowerCase().startsWith('s') ? 'sNaN' : 'NaN') + special[3].replace(/^0+/, '')]
  if (/^[+-]?inf(?:inity)?$/i.test(text)) return ['special', text.startsWith('-') ? '-Infinity' : 'Infinity']
  const match = /^([+-]?)([0-9]*)(?:\.([0-9]*))?(?:[eE]([+-]?[0-9]+))?$/.exec(text)
  if (!match || !(match[2] || match[3])) return null
  let places = (match[3]?.length ?? 0) - Number(match[4] ?? 0)
  if (!Number.isSafeInteger(places)) return null
  // Avoid allocating an unbounded exponent expansion just to compare terms.
  let digits = (match[2] + (match[3] ?? '')).replace(/^0+/, '') || '0'
  if (places <= 0) {
    const trailing = /0+$/.exec(digits)?.[0].length ?? 0
    if (digits === '0') places = 0
    else { digits = digits.slice(0, digits.length - trailing); places -= trailing }
  }
  return [match[1] === '-', digits, places]
}

/** RDFLib normalizes recognized lexical forms before using literal term identity. */
export function literalKey(term) {
  const datatype = term.datatype.value
  let value = canonicalLiteral(term)
  const type = datatype.startsWith(XSD) ? datatype.slice(XSD.length) : ''
  const numeric = decimalDigits(value.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, ''))
  if (integers.has(type) && /^[+-]?[0-9](?:_?[0-9])*$/.test(numeric) && numeric.length <= 4300)
    value = String(BigInt(numeric.replaceAll('_', '')))
  else if (type === 'boolean') value = ['1', 'true'].includes(value.toLowerCase()) ? 'true' : 'false'
  else if (type === 'decimal') value = decimal(numeric.replaceAll('_', '')) ?? value
  else if (['float', 'double'].includes(type)) {
    const text = numeric.replaceAll('_', '')
    if (!/(?:^_|_$|[^0-9]_|_[^0-9])/.test(numeric) && /^[+-]?(?:(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:e[+-]?[0-9]+)?|inf(?:inity)?|nan)$/i.test(text)) {
      const number = /inf/i.test(text) ? (text.startsWith('-') ? -Infinity : Infinity) : Number(text)
      value = Object.is(number, -0) ? '-0' : String(number)
    }
  } else if (['normalizedString', 'token'].includes(type)) {
    value = value.replace(/[\t\n\r]/g, ' ')
    if (type === 'token') value = value.replace(/^[\p{White_Space}\x1c-\x1f]+|[\p{White_Space}\x1c-\x1f]+$/gu, '').replace(/ +/g, ' ')
  }
  return JSON.stringify([datatype, term.language?.toLowerCase() ?? '', value])
}

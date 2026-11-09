import {checkUnicodeString} from './unicode-string.js'

// Match pydantic-core 2.41.5's integer parser and its cleanup fallback.
// Unicode White_Space differs from ECMAScript trim (notably U+0085/U+FEFF).
const trim = value => value.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, '')
const jsonInteger = /^-?(?:0|[1-9][0-9]*)$/

function cleanedInteger(value) {
  let text = trim(value)
  if (text.startsWith('+')) {
    text = text.slice(1)
    if (text.startsWith('-')) return null
  }
  let negative = false
  if (text.startsWith('-')) {
    negative = true
    text = text.slice(1)
    if (/^[+-]/.test(text)) return null
  }
  if (!/^[0-9-]/.test(text)) return null
  if (text.startsWith('0')) {
    let index = 1
    while (index < text.length && /[0_]/.test(text[index])) index++
    if (index === text.length) text = text.slice(-1)
    else if (/[1-9-]/.test(text[index])) text = text.slice(index)
    else if (text[index] === '.') text = text.slice(index - 1)
    else return null
  }
  text = text.replace(/\.0+$/, '')
  if (text.includes('_') && !text.startsWith('_') && !text.endsWith('_') && !text.includes('__'))
    text = text.replaceAll('_', '')
  return (negative ? '-' : '') + text
}

export function parseInteger(value, loc, errors) {
  const error = (type, msg) => errors.push({loc, type, msg})
  if (typeof value === 'bigint') return value
  if (typeof value === 'boolean') return Number(value)
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      // Floating JSON tokens use pydantic-core's signed conversion bounds;
      // genuine arbitrary-precision integer tokens arrive as bigint instead.
      if (Math.abs(value) >= 2 ** 63) {
        error('int_parsing_size', 'Unable to parse input string as an integer, exceeded maximum size')
        return value
      }
      return Number.isSafeInteger(value) ? value : BigInt(value)
    }
    error(Number.isFinite(value) ? 'int_from_float' : 'finite_number', Number.isFinite(value)
      ? 'Input should be a valid integer, got a number with a fractional part' : 'Input should be a finite number')
  } else if (typeof value === 'string') {
    if (!checkUnicodeString(value, loc, errors)) return value;
    // jiter diagnoses an overlong leading JSON integer before inspecting its
    // trailing content. Failure after cleanup has the generic parsing code.
    const prefix = /^-?[1-9][0-9]*/.exec(value)?.[0]
    if (prefix?.length > 4300) {
      error('int_parsing_size', 'Unable to parse input string as an integer, exceeded maximum size')
      return value
    }
    const text = jsonInteger.test(value) ? value : cleanedInteger(value)
    if (text !== null && text.length <= 4300 && jsonInteger.test(text)) {
      const exact = BigInt(text)
      return Number.isSafeInteger(Number(exact)) ? Number(exact) : exact
    }
    error('int_parsing', 'Input should be a valid integer, unable to parse string as an integer')
  } else error('int_type', 'Input should be a valid integer')
  return value
}

import {parseJSONWithOrder} from './ordered-members.js'
import {recordFloat} from './number-kinds.js'

const integer = /^-?\d+$/

export function parseMetadata(text: string) {
  // CPython's JSON reader accepts these non-finite constants. Replace only
  // bare value tokens; quoted text, keys and malformed JSON stay untouched.
  let marker = 'urn:bijux:json-number:'
  while (text.includes(marker)) marker += '-'
  const constants = new Map<string, number>()
  const tokens = /"|-?Infinity|NaN/g
  const parts: string[] = []
  let consumed = 0, noFurtherClosingQuote = false
  for (let match = tokens.exec(text); match; match = tokens.exec(text)) {
    const token = match[0], offset = match.index
    if (token === '"') {
      // Skip an entire quoted token without a quantified regular expression:
      // V8 can exhaust its stack on large, otherwise valid strings.
      if (noFurtherClosingQuote) continue
      let end = text.indexOf('"', offset + 1)
      while (end !== -1) {
        let slash = end - 1
        while (slash > offset && text[slash] === '\\') slash--
        if ((end - 1 - slash) % 2 === 0) break
        end = text.indexOf('"', end + 1)
      }
      if (end === -1) noFurtherClosingQuote = true
      else tokens.lastIndex = end + 1
      continue
    }
    let before = offset - 1, after = offset + token.length
    while (/[ \t\r\n]/.test(text[before] ?? '')) before--
    while (/[ \t\r\n]/.test(text[after] ?? '')) after++
    if ((before >= 0 && !/[:\[,]/.test(text[before])) ||
        (after < text.length && !/[,}\]]/.test(text[after]))) continue
    const key = marker + token
    constants.set(key, token === 'NaN' ? NaN : token === 'Infinity' ? Infinity : -Infinity)
    parts.push(text.slice(consumed, offset), JSON.stringify(key))
    consumed = offset + token.length
  }
  if (parts.length) text = parts.join('') + text.slice(consumed)
  return parseJSONWithOrder(text, function (this: object, key: string, value: unknown, context?: {source?: string}) {
    if (typeof value === 'string' && constants.has(value)) {
      if (typeof context?.source !== 'string')
        throw new TypeError('This runtime cannot retain JSON numeric token identity')
      // Escaped user strings can decode to a marker without containing its raw
      // spelling. Only the exact token emitted by this lexer denotes a number.
      if (context.source !== JSON.stringify(value)) return value
      recordFloat(this, key)
      return constants.get(value)
    }
    if (typeof value === 'number' && typeof context?.source !== 'string')
      throw new TypeError('This runtime cannot retain JSON numeric token identity')
    if (typeof value === 'number' && /[.eE]/.test(context?.source ?? '')) recordFloat(this, key)
    if (typeof value !== 'number' || Number.isSafeInteger(value))
      return Object.is(value, -0) && integer.test(context?.source ?? '') ? 0 : value
    const source = context?.source
    if (source && integer.test(source)) {
      // CPython's default JSON integer conversion also bounds decimal digits.
      if (source.replace('-', '').length > 4300) throw new Error('Metadata integer exceeds the reference digit limit')
      return BigInt(source)
    }
    return value
  })
}

import {parseJSONWithOrder} from './ordered-members.js'
import {recordFloat} from './number-kinds.js'

const integer = /^-?\d+$/

/** Choose a short marker absent from the raw text without repeated full-text scans. */
function freshMarker(text: string): {value:string; legacyHyphens:number; compact:boolean} {
  const prefix = 'urn:bijux:json-number:'
  let offset = text.indexOf(prefix), longest = -1
  while (offset !== -1) {
    const start = offset + prefix.length
    let end = start
    while (text[end] === '-') end++
    longest = Math.max(longest, end - start)
    offset = text.indexOf(prefix, end)
  }
  const legacyHyphens = longest + 1
  const legacyLength = prefix.length + legacyHyphens
  // Count potential constants conservatively, including those in strings.
  // The legacy marker is used only if its projected rewrite stays bounded.
  if (legacyHyphens <= 64) {
    const tokens = /-?Infinity|NaN/g
    let count = 0, exceedsBudget = false
    while (tokens.exec(text)) {
      if (text.length + ++count * (legacyLength + 2) > 4 * text.length) {exceedsBudget = true; break}
    }
    if (!exceedsBudget) return {value:prefix + '-'.repeat(legacyHyphens), legacyHyphens, compact:false}
  }
  // Fixed-width candidates may overlap only at their delimiter. One more
  // candidate than the maximum number of occurrences guarantees a free one.
  const maxCandidate = Math.floor(text.length / 9)
  const used = new Uint8Array(Math.ceil((maxCandidate + 1) / 8))
  offset = text.indexOf('~')
  while (offset !== -1) {
    const candidate = text.slice(offset, offset + 10)
    if (/^~[0-9a-f]{8}~$/.test(candidate)) {
      const number = Number.parseInt(candidate.slice(1, 9), 16)
      if (number <= maxCandidate) used[number >>> 3] |= 1 << (number & 7)
    }
    offset = text.indexOf('~', offset + 1)
  }
  let number = 0
  while (number <= maxCandidate && (used[number >>> 3] & (1 << (number & 7)))) number++
  if (number > maxCandidate) throw Error('Unable to allocate a JSON number marker')
  return {value:'~' + number.toString(16).padStart(8, '0') + '~', legacyHyphens, compact:true}
}

export function parseMetadata(text: string) {
  // CPython's JSON reader accepts these non-finite constants. Replace only
  // bare value tokens; quoted text, keys and malformed JSON stay untouched.
  const inputLength = text.length
  const selectedMarker = freshMarker(text), marker = selectedMarker.value
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
  const tail = text.slice(consumed)
  if (parts.length) text = parts.join('') + tail
  const revive = function (this: object, key: string, value: unknown, context?: {source?: string}) {
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
  }
  try {return parseJSONWithOrder(text, revive)}
  catch (error) {
    // Reproduce native legacy syntax diagnostics when doing so needs no more
    // than four times the original input. Avoid attacker-controlled expansion.
    const legacyLength = 'urn:bijux:json-number:'.length + selectedMarker.legacyHyphens
    const legacySize = text.length + (parts.length / 2) * (legacyLength - marker.length)
    if (error instanceof SyntaxError && selectedMarker.compact && parts.length && legacySize <= inputLength * 4) {
      const legacy = 'urn:bijux:json-number:' + '-'.repeat(selectedMarker.legacyHyphens)
      const expanded = parts.map((part, index) => index % 2 ? JSON.stringify(legacy + part.slice(marker.length + 1, -1)) : part).join('') + tail
      try {JSON.parse(expanded)} catch (legacyError) {if (legacyError instanceof SyntaxError) throw legacyError}
    }
    throw error
  }
}

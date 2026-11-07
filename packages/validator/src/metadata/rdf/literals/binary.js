const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function binaryLiteral(text, type) {
  if (type === 'hexBinary') return /^(?:[0-9a-f]{2})*$/i.test(text) ? text.toLowerCase() : text
  if (type !== 'base64Binary' || /[^\x00-\x7f]/.test(text)) return text
  const bytes = []
  let position = 0, previous = 0, pads = 0, finished = false
  for (const char of text) {
    if (char === '=') {
      if (position >= 2 && ++pads + position >= 4) {finished = true; break}
      continue
    }
    const digit = alphabet.indexOf(char)
    if (digit < 0) continue
    pads = 0
    if (position) bytes.push(((previous << (position * 2)) | (digit >> (6 - position * 2))) & 255)
    previous = digit
    position = (position + 1) % 4
  }
  if (!finished && position) return text
  let result = ''
  for (let at = 0; at < bytes.length; at += 3) {
    const a = bytes[at], b = bytes[at + 1], c = bytes[at + 2]
    result += alphabet[a >> 2] + alphabet[((a & 3) << 4) | ((b ?? 0) >> 4)] +
      (b === undefined ? '=' : alphabet[((b & 15) << 2) | ((c ?? 0) >> 6)]) +
      (c === undefined ? '=' : alphabet[c & 63])
  }
  return result
}

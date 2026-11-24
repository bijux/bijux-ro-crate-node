/** Admit only JSON numbers whose value and lexical type survive native serialization. */
export function parsePreservingJSON(text: string): unknown {
  const result: unknown = JSON.parse(text)
  let position = 0
  const space = () => {while (/[\x20\t\r\n]/.test(text[position] ?? '')) position++}
  function string(): string {
    const start = position++
    while (text[position] !== '"') position += text[position] === '\\' ? 2 : 1
    position++
    return JSON.parse(text.slice(start, position)) as string
  }
  function value(depth: number): void {
    if (depth > 128) throw Error('JSON nesting exceeds the supported limit')
    space()
    if (text[position] === '"') {string(); return}
    if (text[position] === '{') {
      position++; space(); const keys = new Set<string>()
      while (text[position] !== '}') {
        const key = string()
        if (keys.has(key)) throw Error('Duplicate JSON object member')
        keys.add(key); space(); position++; value(depth + 1); space()
        if (text[position] === ',') {position++; space()} else break
      }
      position++; return
    }
    if (text[position] === '[') {
      position++; space()
      while (text[position] !== ']') {value(depth + 1); space(); if (text[position] === ',') {position++; space()} else break}
      position++; return
    }
    const start = position
    while (position < text.length && !/[\x20\t\r\n,}\]]/.test(text[position])) position++
    const token = text.slice(start, position)
    if (/^-?\d/.test(token) && (!/^(?:0|-[1-9]\d*|[1-9]\d*)$/.test(token) || !Number.isSafeInteger(Number(token)))) throw Error('JSON number cannot be preserved safely')
  }
  value(0)
  return result
}

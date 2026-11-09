const ascii = /^[A-Za-z_][A-Za-z0-9_.-]*$/

/** Only name tokens in these empty XML fixtures may receive substitution. */
export function asciiNameCounterpart(fragment, pair, replacement) {
  if (!ascii.test(replacement)) throw new Error('Expected an ASCII XML name')
  const rename = name => {
    if (!name.includes(pair.character)) throw new Error('Expected the declared XML name character')
    const renamed = name.replaceAll(pair.character, replacement)
    if (!ascii.test(renamed)) throw new Error('Counterpart XML name is not ASCII')
    return renamed
  }
  if (pair.role === 'element') {
    const match = /^<([^<>\s/'"=]+)(?:\/>|><\/\1>)(?![\s\S])/u.exec(fragment)
    if (match) {
      const name = rename(match[1])
      return fragment.endsWith('/>') ? '<' + name + '/>' : '<' + name + '></' + name + '>'
    }
  } else if (pair.role === 'attribute') {
    const match = /^<x ([^<>\s/'"=]+)="v"(?:\/>|><\/x>)(?![\s\S])/u.exec(fragment)
    if (match) {
      const name = rename(match[1])
      return '<x ' + name + '="v"' + (fragment.endsWith('/>') ? '/>' : '></x>')
    }
  } else if (pair.role === 'processing-instruction') {
    const match = /^<\?([^<>\s?'"=]+)( ?)\?>(?![\s\S])/u.exec(fragment)
    if (match) return '<?' + rename(match[1]) + match[2] + '?>'
  }
  throw new Error('XML name qualification cannot replace character data or attribute values')
}

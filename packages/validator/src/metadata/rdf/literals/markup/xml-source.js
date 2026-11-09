// XML 1.0 Fifth Edition productions [4], [4a] and [5]. Explicit ranges avoid
// depending on the JavaScript runtime's evolving Unicode character database.
// Namespace-qualified names consist of one or two NCName components.
const start = 'A-Z_a-z\\u00c0-\\u00d6\\u00d8-\\u00f6\\u00f8-\\u02ff\\u0370-\\u037d\\u037f-\\u1fff\\u200c-\\u200d\\u2070-\\u218f\\u2c00-\\u2fef\\u3001-\\ud7ff\\uf900-\\ufdcf\\ufdf0-\\ufffd\\u{10000}-\\u{effff}'
const continuation = start + '\\-.0-9\\u00b7\\u0300-\\u036f\\u203f-\\u2040'
const part = '[' + start + '][' + continuation + ']*'
const qualifiedName = new RegExp('^' + part + '(?::' + part + ')?$', 'u')
const unprefixedName = new RegExp('^' + part + '$', 'u')
export const invalidXMLCharacter = /[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/u

export function assertXMLQualifiedName(value) {
  if (!qualifiedName.test(value)) throw new Error('Invalid XML qualified name')
}

export function assertXMLUnprefixedName(value) {
  if (!unprefixedName.test(value)) throw new Error('Invalid XML unprefixed name')
}

function afterReference(text, index) {
  const end = text.indexOf(';', index + 1)
  if (end < 0) throw new Error('Unterminated XML reference')
  const value = text.slice(index + 1, end)
  if (['amp', 'lt', 'gt', 'apos', 'quot'].includes(value)) return end + 1
  if (!/^#(?:[0-9]+|x[0-9a-fA-F]+)$/.test(value)) throw new Error('Invalid XML reference')
  const point = value[1] === 'x' ? Number.parseInt(value.slice(2), 16) : Number.parseInt(value.slice(1), 10)
  if (point > 0x10ffff || invalidXMLCharacter.test(String.fromCodePoint(point))) throw new Error('Invalid XML character reference')
  return end + 1
}

/** Preserve source errors that a permissive DOM parser can silently repair. */
export function assertXMLSource(text) {
  if (invalidXMLCharacter.test(text)) throw new Error('Invalid XML character')
  let index = 0
  while (index < text.length) {
    const delimited = text.startsWith('<!--', index) ? ['<!--', '-->'] :
      text.startsWith('<![CDATA[', index) ? ['<![CDATA[', ']]>'] :
      text.startsWith('<?', index) ? ['<?', '?>'] : null
    if (delimited) {
      const end = text.indexOf(delimited[1], index + delimited[0].length)
      if (end < 0) throw new Error('Unterminated XML markup')
      index = end + delimited[1].length
    } else if (text[index] === '<') {
      const closing = text[index + 1] === '/'
      index += closing ? 2 : 1
      let quote, ended = false
      while (index < text.length) {
        const character = text[index]
        if (quote) {
          if (character === '&') {index = afterReference(text, index); continue}
          if (character === '<') throw new Error('Unescaped XML attribute delimiter')
          if (character === quote) quote = undefined
        } else if (character === '"' || character === "'") quote = character
        else if (character === '<') throw new Error('Invalid XML tag delimiter')
        else if (character === '/') {
          if (closing || text[index + 1] !== '>') throw new Error('Invalid XML empty-element close')
        } else if (character === '>') {index++; ended = true; break}
        index++
      }
      if (!ended) throw new Error('Unterminated XML tag')
    } else {
      if (text.startsWith(']]>', index)) throw new Error('CDATA close in XML character data')
      index = text[index] === '&' ? afterReference(text, index) : index + 1
    }
  }
}

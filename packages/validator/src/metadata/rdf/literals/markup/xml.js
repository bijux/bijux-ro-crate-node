import {DOMParser} from '@xmldom/xmldom'

const invalidCharacter = /[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/u
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const attribute = text => escape(text).replaceAll('"', '&quot;').replaceAll('\r', '&#13;').replaceAll('\n', '&#10;').replaceAll('\t', '&#9;')

function serialize(node) {
  if (invalidCharacter.test(node.nodeValue ?? '')) throw new Error('Invalid XML character')
  if (node.nodeType === 1) {
    const attributes = Array.from(node.attributes).map(attr => {
      if (invalidCharacter.test(attr.value)) throw new Error('Invalid XML attribute')
      return ' ' + attr.name + '="' + attribute(attr.value) + '"'
    }).join('')
    const children = Array.from(node.childNodes)
    return '<' + node.tagName + attributes + (children.length ? '>' + children.map(serialize).join('') + '</' + node.tagName + '>' : '/>')
  }
  if (node.nodeType === 3) return escape(node.data)
  if (node.nodeType === 4) return '<![CDATA[' + node.data + ']]>'
  if (node.nodeType === 7) return '<?' + node.target + ' ' + node.data + '?>'
  if (node.nodeType === 8) return '<!--' + node.data + '-->'
  throw new Error('Unsupported XML fragment node')
}

export function xmlLiteral(text) {
  try {
    if (invalidCharacter.test(text)) return text
    const document = new DOMParser({onError() {throw new Error('Invalid XML fragment')}})
      .parseFromString('<rdflibtoplevelelement>' + text + '</rdflibtoplevelelement>', 'application/xml')
    return Array.from(document.documentElement.childNodes).map(serialize).join('')
  } catch {return text}
}

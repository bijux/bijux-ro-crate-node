import type {Node, Element, CharacterData, ProcessingInstruction} from '@xmldom/xmldom'
import {parseXMLFragment} from './xml-parser.js'
import {invalidXMLCharacter as invalidCharacter} from './xml-source.js'
const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const attribute = (text: string) => escape(text).replaceAll('"', '&quot;').replaceAll('\r', '&#13;').replaceAll('\n', '&#10;').replaceAll('\t', '&#9;')

function serialize(node: Node): string {
  if (invalidCharacter.test(node.nodeValue ?? '')) throw new Error('Invalid XML character')
  if (node.nodeType === 1) {
    const element = node as Element
    const attributes = Array.from(element.attributes).map(attr => {
      if (invalidCharacter.test(attr.value)) throw new Error('Invalid XML attribute')
      return ' ' + attr.name + '="' + attribute(attr.value) + '"'
    }).join('')
    const children = Array.from(element.childNodes)
    return '<' + element.tagName + attributes + (children.length ? '>' + children.map(serialize).join('') + '</' + element.tagName + '>' : '/>')
  }
  if (node.nodeType === 3) return escape((node as CharacterData).data)
  if (node.nodeType === 4) return '<![CDATA[' + (node as CharacterData).data + ']]>'
  if (node.nodeType === 7) return '<?' + (node as ProcessingInstruction).target + ' ' + (node as CharacterData).data + '?>'
  if (node.nodeType === 8) return '<!--' + (node as CharacterData).data + '-->'
  throw new Error('Unsupported XML fragment node')
}

export function xmlLiteral(text: string) {
  try {
    const document = parseXMLFragment(text)
    return Array.from(document.documentElement!.childNodes).map(serialize).join('')
  } catch {return text}
}

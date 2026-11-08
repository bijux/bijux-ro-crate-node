import data from './html-data.json' with {type: 'json'}
import {parseHTMLFragment} from './html-parser.js'
import {omitOptionalTags} from './optional-tags.js'

const voidElements = new Set(data.void_elements), rawText = new Set(data.raw_text)
const booleanAttributes = new Map(Object.entries(data.boolean_attributes).map(([name, attrs]) => [name, new Set(attrs)]))
const quoteRequired = /[\x00-\x20"'=<>`/\xa0\u1680\u180e\u180f\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

function tokensFor(node, tokens) {
  if (node.nodeName === '#text') {
    const [, left, text, right] = /^([\t\n\f\r ]*)([\s\S]*?)([\t\n\f\r ]*)$/.exec(node.value)
    if (left) tokens.push({type: 'space', text: left})
    if (text) tokens.push({type: 'text', text})
    if (right) tokens.push({type: 'space', text: right})
  } else if (node.nodeName === '#comment') tokens.push({type: 'comment', text: node.data})
  else if (node.tagName) {
    const empty = node.namespaceURI === data.namespace && voidElements.has(node.tagName)
    tokens.push({type: empty ? 'empty' : 'start', name: node.tagName, attrs: node.attrs})
    if (!empty) {
      for (const child of node.content?.childNodes ?? node.childNodes) tokensFor(child, tokens)
      tokens.push({type: 'end', name: node.tagName})
    }
  } else for (const child of node.childNodes ?? []) tokensFor(child, tokens)
}

function attributes(token) {
  return token.attrs.map(({name, value}) => {
    const prefix = ' ' + name
    if (booleanAttributes.get(token.name)?.has(name) || booleanAttributes.get('').has(name)) return prefix
    const quoted = !value.length || quoteRequired.test(value)
    value = value.replaceAll('&', '&amp;')
    if (!quoted) return prefix + '=' + value
    const quote = value.includes('"') && !value.includes("'") ? "'" : '"'
    value = value.replaceAll(quote, quote === '"' ? '&quot;' : '&#39;')
    return prefix + '=' + quote + value + quote
  }).join('')
}

export function htmlLiteral(text) {
  try {
    const tokens = []
    tokensFor(parseHTMLFragment(text), tokens)
    let result = '', inRawText = false
    for (const token of omitOptionalTags(tokens)) {
      if (token.type === 'text' || token.type === 'space') result += inRawText || token.type === 'space' ? token.text : escape(token.text)
      else if (token.type === 'comment') result += '<!--' + token.text + '-->'
      else if (token.type === 'end') {
        if (rawText.has(token.name)) inRawText = false
        result += '</' + token.name + '>'
      } else {
        if (rawText.has(token.name)) inRawText = true
        result += '<' + token.name + attributes(token) + '>'
      }
    }
    return result
  } catch {return text}
}

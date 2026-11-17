import type {DefaultTreeAdapterTypes} from 'parse5'
import type {HTMLToken} from './optional-tags.js'
import data from './html-data.json' with {type: 'json'}
import {parseHTMLFragment} from './html-parser.js'
import {omitOptionalTags} from './optional-tags.js'

const voidElements = new Set(data.void_elements), rawText = new Set(data.raw_text)
const booleanAttributes = new Map(Object.entries(data.boolean_attributes).map(([name, attrs]) => [name, new Set(attrs)]))
const quoteRequired = /[\x00-\x20"'=<>`/\xa0\u1680\u180e\u180f\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/
const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

type ElementNode = DefaultTreeAdapterTypes.Element & {content?: DefaultTreeAdapterTypes.DocumentFragment}
type TagToken = Extract<HTMLToken, {attrs: unknown}>

function tokensFor(node: DefaultTreeAdapterTypes.Node, tokens: HTMLToken[]) {
  if (node.nodeName === '#text') {
    const [, left, text, right] = /^([\t\n\f\r ]*)([\s\S]*?)([\t\n\f\r ]*)$/.exec((node as DefaultTreeAdapterTypes.TextNode).value)!
    if (left) tokens.push({type: 'space', text: left})
    if (text) tokens.push({type: 'text', text})
    if (right) tokens.push({type: 'space', text: right})
  } else if (node.nodeName === '#comment') tokens.push({type: 'comment', text: (node as DefaultTreeAdapterTypes.CommentNode).data})
  else if ((node as ElementNode).tagName) {
    const empty = (node as ElementNode).namespaceURI === data.namespace && voidElements.has((node as ElementNode).tagName)
    tokens.push({type: empty ? 'empty' : 'start', name: (node as ElementNode).tagName, attrs: (node as ElementNode).attrs})
    if (!empty) {
      for (const child of (node as ElementNode).content?.childNodes ?? (node as DefaultTreeAdapterTypes.ParentNode).childNodes) tokensFor(child, tokens)
      tokens.push({type: 'end', name: (node as ElementNode).tagName})
    }
  } else for (const child of (node as DefaultTreeAdapterTypes.ParentNode).childNodes ?? []) tokensFor(child, tokens)
}

function attributes(token: TagToken) {
  return token.attrs.map(({name, value}) => {
    const prefix = ' ' + name
    if (booleanAttributes.get(token.name)?.has(name) || booleanAttributes.get('')!.has(name)) return prefix
    const quoted = !value.length || quoteRequired.test(value)
    value = value.replaceAll('&', '&amp;')
    if (!quoted) return prefix + '=' + value
    const quote = value.includes('"') && !value.includes("'") ? "'" : '"'
    value = value.replaceAll(quote, quote === '"' ? '&quot;' : '&#39;')
    return prefix + '=' + quote + value + quote
  }).join('')
}

export function htmlLiteral(text: string) {
  try {
    const tokens: HTMLToken[] = []
    tokensFor(parseHTMLFragment(text), tokens)
    let result = '', inRawText = false
    for (const token of omitOptionalTags(tokens)) {
      if (token.type === 'text' || token.type === 'space') result += inRawText || token.type === 'space' ? token.text : escape(token.text)
      else if (token.type === 'comment') result += '<!--' + token.text + '-->'
      else if (token.type === 'end') {
        if (rawText.has(token.name)) inRawText = false
        result += '</' + token.name + '>'
      } else {
        if (rawText.has((token as TagToken).name)) inRawText = true
        result += '<' + (token as TagToken).name + attributes(token as TagToken) + '>'
      }
    }
    return result
  } catch {return text}
}

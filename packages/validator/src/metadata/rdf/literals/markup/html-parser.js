import {Parser, InsertionMode, html, foreignContent, defaultTreeAdapter as tree} from 'parse5'

const headings = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
const impliedEnds = new Set(['dd', 'dt', 'li', 'option', 'optgroup', 'p', 'rp', 'rt'])
const tableEnds = new Set([...impliedEnds, 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'colgroup'])
const tableClosers = new Set(['table', 'tbody', 'thead', 'tfoot', 'tr', 'colgroup'])
const formatting = new Set(['a', 'b', 'big', 'code', 'em', 'font', 'i', 'nobr', 's', 'small', 'strike', 'strong', 'tt', 'u'])
const tableModes = new Set([InsertionMode.IN_TABLE, InsertionMode.IN_TABLE_BODY, InsertionMode.IN_ROW])
const captionStarts = new Set(['caption', 'col', 'colgroup', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr'])
const allowedEOF = new Set(['dd', 'dt', 'li', 'p', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'body', 'html'])

/** Preserve the locked strict HTML parser's lexical fallback on tree repairs. */
class StrictFragmentParser extends Parser {
  _createElement(name, ...args) {
    // The reference permits fostered table text, but rejects fostered elements.
    if (this.fosterParentingEnabled) throw new Error('Unexpected element in table')
    this.creationCounts ??= new Map()
    const key = name.toLowerCase()
    this.creationCounts.set(key, (this.creationCounts.get(key) ?? 0) + 1)
    return super._createElement(name, ...args)
  }

  _insertFakeElement(name, ...args) {
    // Missing tbody/colgroup tags are legal; a missing row is a strict error.
    if (name === 'tr') throw new Error('Missing table row')
    return super._insertFakeElement(name, ...args)
  }

  onStartTag(token) {
    const name = token.tagName.toLowerCase(), count = this.creationCounts?.get(name) ?? 0
    // The locked strict parser rejects a foreign-content breakout before the
    // normal HTML recovery path pops SVG or MathML elements from the stack.
    if (this.shouldProcessStartTagTokenInForeignContent(token) && foreignContent.causesExit(token))
      throw new Error('Unexpected HTML element in foreign content')
    const tagID = token.tagID
    // html5rdf treats template as an ordinary element, without template modes.
    if (name === 'template') token.tagID = html.TAG_ID.UNKNOWN
    const previousStart = this.strictStartTag
    this.strictStartTag = name
    try {
      super.onStartTag(token)
      if (count === (this.creationCounts?.get(name) ?? 0)) throw new Error('Ignored or substituted start tag')
    } finally {
      this.strictStartTag = previousStart
      token.tagID = tagID
    }
  }

  onItemPop(node, isTop) {
    // Heading recovery runs after closing a paragraph, in the actual body handler.
    if (headings.has(this.strictStartTag) && node.namespaceURI === html.NS.HTML && headings.has(node.tagName))
      throw new Error('Nested HTML heading')
    super.onItemPop(node, isTop)
  }

  _reconstructActiveFormattingElements() {
    super._reconstructActiveFormattingElements()
    // The nobr scope test follows reconstruction, including detached formatting.
    if (this.strictStartTag === 'nobr' && this.openElements.hasInScope(html.TAG_ID.NOBR))
      throw new Error('Nested nobr')
  }

  _startTagOutsideForeignContent(token) {
    const name = token.tagName.toLowerCase()
    // The reference reports this obsolete element before its legacy recovery.
    if (name === 'isindex') throw new Error('Deprecated HTML element')
    if (name === 'button' && this.openElements.hasInScope(html.TAG_ID.BUTTON)) throw new Error('Nested button')
    if (name === 'a' && this.activeFormattingElements.getElementEntryInScopeWithTagName('a')) throw new Error('Nested anchor')
    if (tableModes.has(this.insertionMode) && ['input', 'form', 'table'].includes(name))
      throw new Error('Unexpected element in table')
    if (this.insertionMode === InsertionMode.IN_CAPTION && captionStarts.has(name)) throw new Error('Unclosed table caption')
    super._startTagOutsideForeignContent(token)
  }

  onEndTag(token) {
    const name = token.tagName.toLowerCase()
    // Formatting and foreign elements require an exact current-node match.
    // Other HTML ends may close only the reference's implied end elements.
    const allowed = this.currentNotInHTML || formatting.has(name) ? undefined : tableClosers.has(name) ? tableEnds : impliedEnds
    let found = false
    for (let i = this.openElements.stackTop; i >= 0; i = this.openElements.slotBelow(i)) {
      const node = this.openElements.items[i], current = node.tagName.toLowerCase()
      if (current === name) {found = true; break}
      if (node.namespaceURI !== html.NS.HTML || !allowed?.has(current)) break
    }
    if (!found) throw new Error('Unmatched or misnested end tag')
    if (name === 'template') token.tagID = html.TAG_ID.UNKNOWN
    super.onEndTag(token)
  }

  onDoctype() {throw new Error('Unexpected fragment doctype')}
}

export function parseHTMLFragment(text) {
  const context = tree.createElement('div', html.NS.HTML, [])
  const parser = StrictFragmentParser.getFragmentParser(context, {
    scriptingEnabled: false,
    onParseError() {throw new Error('Invalid HTML fragment')},
  })
  parser.tokenizer.write(text, true)
  // Parse5 accepts unclosed nonoptional body elements at EOF; html5rdf rejects.
  for (let i = parser.openElements.stackTop; i >= 0; i = parser.openElements.slotBelow(i))
    if (!allowedEOF.has(parser.openElements.items[i].tagName)) throw new Error('Unclosed HTML element')
  return parser.getFragment()
}

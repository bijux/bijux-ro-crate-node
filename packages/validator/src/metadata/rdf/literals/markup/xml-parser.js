import {DOMParser} from '@xmldom/xmldom'
import {__DOMHandler as DOMHandler} from '@xmldom/xmldom/lib/dom-parser.js'
import {assertXMLUnprefixedName, assertXMLQualifiedName, assertXMLSource} from './xml-source.js'

const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace'
const XMLNS_NAMESPACE = 'http://www.w3.org/2000/xmlns/'

function assertNamespace(name, value) {
  const prefix = name === 'xmlns' ? '' : name.slice(6)
  // Preserve the locked parser's ASCII-space namespace separator behavior.
  if (prefix === 'xmlns' || value === XMLNS_NAMESPACE || value.includes(' ') ||
      (prefix === 'xml' ? value !== XML_NAMESPACE : value === XML_NAMESPACE) ||
      (prefix !== '' && value === '')) throw new Error('Invalid XML namespace binding')
}

class FragmentHandler extends DOMHandler {
  startDocument() {
    super.startDocument()
    const createElement = this.doc.createElementNS
    // XML permits an unprefixed element named xmlns. The DOM constructor's
    // attribute-oriented namespace check cannot construct that parsed element.
    this.doc.createElementNS = function(namespace, name) {
      if (name !== 'xmlns') return createElement.call(this, namespace, name)
      const element = this.createElement(name)
      element.namespaceURI = namespace || null
      element.prefix = null
      return element
    }
  }

  startElement(namespace, local, qualified, attributes) {
    assertXMLQualifiedName(qualified)
    if (qualified.startsWith('xmlns:')) throw new Error('Invalid XML element prefix')
    const expanded = new Map()
    // Validate the SAX attribute list before DOM insertion can replace aliases
    // with equal expanded names, including illegal namespace declarations.
    for (let index = 0; index < attributes.length; index++) {
      const name = attributes.getQName(index)
      assertXMLQualifiedName(name)
      if (name === 'xmlns' || name.startsWith('xmlns:')) assertNamespace(name, attributes.getValue(index))
      const uri = attributes.getURI(index) || ''
      if (!expanded.has(uri)) expanded.set(uri, new Set())
      const names = expanded.get(uri), local = attributes.getLocalName(index)
      if (names.has(local)) throw new Error('Duplicate expanded XML attribute')
      names.add(local)
    }
    super.startElement(namespace, local, qualified, attributes)
  }

  processingInstruction(target, data) {
    assertXMLUnprefixedName(target)
    super.processingInstruction(target, data)
  }
}

export function parseXMLFragment(text) {
  assertXMLSource(text)
  return new DOMParser({
    domHandler: FragmentHandler,
    normalizeLineEndings: input => input.replace(/\r\n?/g, '\n'),
    onError(level, message) {
      // U+FFFD is a legal XML character, including in attribute values. This
      // exact advisory does not diagnose a source-syntax error.
      if (level === 'warning' && message === 'Unicode replacement character detected, source encoding issues?') return
      throw new Error('Invalid XML fragment')
    },
  }).parseFromString('<rdflibtoplevelelement>' + text + '</rdflibtoplevelelement>', 'application/xml')
}

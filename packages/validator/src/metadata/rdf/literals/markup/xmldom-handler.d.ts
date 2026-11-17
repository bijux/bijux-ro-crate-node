declare module '@xmldom/xmldom/lib/dom-parser.js' {
  export interface SAXAttributes {
    length: number
    getQName(index: number): string
    getValue(index: number): string
    getURI(index: number): string | null | undefined
    getLocalName(index: number): string
  }
  interface MutableElement { namespaceURI: string | null; prefix: string | null }
  interface MutableDocument {
    createElement(name: string): MutableElement
    createElementNS(namespace: string | null | undefined, name: string): MutableElement
  }
  export class __DOMHandler {
    doc: MutableDocument
    startDocument(): void
    startElement(namespace: string | null | undefined, local: string, qualified: string, attributes: SAXAttributes): void
    processingInstruction(target: string, data: string): void
  }
}

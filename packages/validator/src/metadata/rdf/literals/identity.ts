import {canonicalLiteral} from './canonical.js'
import type {LiteralTerm} from './canonical.js'

/** Term identity preserves datatype and language alongside normalized spelling. */
export function literalKey(term: LiteralTerm) {
  return JSON.stringify([term.datatype.value, term.language?.toLowerCase() ?? '', canonicalLiteral(term)])
}

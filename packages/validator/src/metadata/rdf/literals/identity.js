import {canonicalLiteral} from './canonical.js'

/** Term identity preserves datatype and language alongside normalized spelling. */
export function literalKey(term) {
  return JSON.stringify([term.datatype.value, term.language?.toLowerCase() ?? '', canonicalLiteral(term)])
}

import {binaryLiteral} from './binary.js'
import {temporalLiteral} from './temporal.js'
import {durationLiteral} from './durations.js'
const XSD = 'http://www.w3.org/2001/XMLSchema#'

/** RDFLib retains invalid lexical values and normalizes recognized valid ones. */
export function canonicalLiteral(term) {
  const datatype = term.datatype.value
  if (!datatype.startsWith(XSD)) return term.value
  const type = datatype.slice(XSD.length)
  if (['duration', 'dayTimeDuration', 'yearMonthDuration'].includes(type)) return durationLiteral(term.value)
  if (['hexBinary', 'base64Binary'].includes(type)) return binaryLiteral(term.value, type)
  return temporalLiteral(term.value, type)
}

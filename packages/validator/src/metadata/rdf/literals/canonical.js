import {numericLiteral} from './numeric.js'
import {binaryLiteral} from './binary.js'
import {temporalLiteral} from './temporal.js'
import {durationLiteral} from './durations.js'
import {xmlLiteral} from './markup/xml.js'
import {htmlLiteral} from './markup/html.js'
const XSD = 'http://www.w3.org/2001/XMLSchema#'

/** RDFLib canonicalizes converted values and preserves failed conversion text. */
export function canonicalLiteral(term) {
  const datatype = term.datatype.value
  if (datatype === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#XMLLiteral') return xmlLiteral(term.value)
  if (datatype === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#HTML') return htmlLiteral(term.value)
  if (!datatype.startsWith(XSD)) return term.value
  const type = datatype.slice(XSD.length)
  const numeric = numericLiteral(term.value, type)
  if (numeric !== undefined) return numeric
  if (type === 'boolean') return ['1', 'true'].includes(term.value.toLowerCase()) ? 'true' : 'false'
  if (['normalizedString', 'token'].includes(type)) {
    let value = term.value.replace(/[\t\n\r]/g, ' ')
    if (type === 'token') value = value.replace(/^[\p{White_Space}\x1c-\x1f]+|[\p{White_Space}\x1c-\x1f]+$/gu, '').replace(/ +/g, ' ')
    return value
  }
  if (['duration', 'dayTimeDuration', 'yearMonthDuration'].includes(type)) return durationLiteral(term.value)
  if (['hexBinary', 'base64Binary'].includes(type)) return binaryLiteral(term.value, type)
  return temporalLiteral(term.value, type)
}

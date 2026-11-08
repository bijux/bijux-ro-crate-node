import {jsonld, rdfOptions} from '../jsonld.js'
import {rootContextPropagates} from './context.js'

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key)
const mappedKey = (state, key) => key.startsWith('@') ? key : state.active.mappings.get(key)?.['@id']
const nonempty = value => value && (typeof value !== 'object' || Object.keys(value).length > 0)

export const contextState = active => ({active, parent: null, propagate: true})
export const isEmptyNodeContext = value => value === null ||
  (typeof value === 'object' && Object.keys(value).length === 0)

async function subcontext(state, source, options, propagate, revert) {
  const parent = revert && !state.propagate ? state.parent : state
  if (!parent) throw new TypeError("'NoneType' object has no attribute '_subcontext'")
  return {
    active: await jsonld.processContext(parent.active, source, rdfOptions(options)),
    parent,
    propagate: await rootContextPropagates(source, options, propagate),
  }
}

/** Resolve a property's coercion before applying its child context. */
export async function propertyContext(state, mapping, options) {
  return mapping && own(mapping, '@context')
    ? subcontext(state, mapping['@context'], options, true, false) : state
}

/** RDFLib selects the first recognized input type, including unscoped types. */
export async function nodeContext(state, value, options) {
  // Literal objects are read before RDFLib enters node-local context processing.
  if (Object.keys(value).some(key => mappedKey(state, key) === '@value')) return state
  if (own(value, '@context')) {
    state = isEmptyNodeContext(value['@context'])
      ? contextState(await jsonld.processContext(null, null, rdfOptions(options)))
      : await subcontext(state, value['@context'], options, true, true)
  }
  const keys = Object.keys(value)
  const typeKey = keys.find(key => mappedKey(state, key) === '@type')
  if (typeKey === undefined) return state.propagate ? state : state.parent
  const types = Array.isArray(value[typeKey]) ? value[typeKey] : [value[typeKey]]
  for (const type of types) {
    const mapping = state.active.mappings.get(type)
    if (!mapping) continue
    if (nonempty(mapping['@context']))
      return subcontext(state, mapping['@context'], options, false, true)
    break
  }
  return state.propagate ? state : state.parent
}

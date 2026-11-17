import {jsonld, rdfOptions} from '../jsonld.js'
import {rootContextPropagates} from './context.js'
import type {ContextOptions} from './context.js'

interface ActiveContext {mappings: Map<unknown, Record<string, unknown> | null>; previousContext?: ActiveContext | null; revertToPreviousContext(): ActiveContext}
interface ContextState {active: ActiveContext; parent: ContextState | null; propagate: boolean; rootPrevious?: boolean}

const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key)
const mappedKey = (state: ContextState, key: string) => key.startsWith('@') ? key : state.active.mappings.get(key)?.['@id']
const nonempty = (value: unknown) => value && (typeof value !== 'object' || Object.keys(value).length > 0)

export const contextState = (active: ActiveContext): ContextState => ({active, parent: null, propagate: true})
export const isEmptyNodeContext = (value: unknown) => value === null ||
  (typeof value === 'object' && Object.keys(value).length === 0)

async function subcontext(state: ContextState | null, source: unknown, options: ContextOptions, propagate: boolean, revert: boolean): Promise<ContextState> {
  const parent = revert && !state!.propagate ? state!.parent : state
  if (!parent) throw new TypeError("'NoneType' object has no attribute '_subcontext'")
  return {
    active: await jsonld.processContext(parent.active, source, rdfOptions(options)) as ActiveContext,
    parent,
    propagate: await rootContextPropagates(source, options, propagate),
  }
}

/** Resolve a property's coercion before applying its child context. */
export async function propertyContext(state: ContextState, mapping: Record<string, unknown> | null | undefined, options: ContextOptions) {
  return mapping && own(mapping, '@context')
    ? subcontext(state.rootPrevious ? state.parent : state, mapping['@context'], options, true, false) : state
}

/** RDFLib selects the first recognized input type, including unscoped types. */
export async function nodeContext(state: ContextState, value: Record<string, unknown>, options: ContextOptions, root = false, indexedType: string | null = null) {
  // Literal objects are read before RDFLib enters node-local context processing.
  if (Object.keys(value).some(key => mappedKey(state, key) === '@value')) return state
  if (state.rootPrevious && !root) {
    const keys = Object.keys(value)
    if (keys.length === 1 && mappedKey(state, keys[0]) === '@id') return state
    state = state.parent!
  }
  if (own(value, '@context')) {
    state = isEmptyNodeContext(value['@context'])
      ? contextState(await jsonld.processContext(null, null, rdfOptions(options)) as ActiveContext)
      : await subcontext(state, value['@context'], options, true, true)
  }
  if (root) {
    // Keep the root's own context. Only descendants revert, and the context
    // processor determines whether an ordered context actually propagates.
    const previous = state.active.previousContext
    state = {...state, propagate: !previous, rootPrevious: Boolean(previous),
      parent: previous ? contextState(state.active.revertToPreviousContext()) : state.parent}
  }
  const keys = Object.keys(value)
  const typeKey = keys.find(key => mappedKey(state, key) === '@type')
  const types = typeKey === undefined ? [] :
    Array.isArray(value[typeKey]) ? [...value[typeKey]] : [value[typeKey]]
  if (indexedType !== null && mappedKey(state, indexedType) !== '@none') types.push(indexedType)
  for (const type of types) {
    const mapping = state.active.mappings.get(type)
    if (!mapping) continue
    if (nonempty(mapping['@context']))
      return subcontext(state, mapping['@context'], options, false, !root)
    break
  }
  return root || state.propagate ? state : state.parent
}

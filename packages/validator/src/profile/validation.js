// Pinned translation of the REQUIRED procedurally evaluated checks and SHACL-AF
// targets/rules from roc-validator 0.8.1. The property constraints are generated.
import {rdfDataset} from '../metadata/rdf.js'
import SHACLValidator from 'rdf-validate-shacl'
import rdf from 'rdf-validate-shacl/src/defaultEnv.js'
import shapes from './shapes.json' with {type: 'json'}
import {materializeProperties} from './property-inference.js'

const FILENAME = 'ro-crate-metadata.json'
const SCHEMA = 'http://schema.org/'
const TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const PROFILE = 'https://github.com/crs4/rocrate-validator/profiles/ro-crate/'
const SH = 'http://www.w3.org/ns/shacl#'
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#'
const OWL = 'http://www.w3.org/2002/07/owl#'
const SPECIAL_KEYS = new Set(['@id', '@type', '@context', '@value', '@language'])
const N = value => rdf.namedNode(value)
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)

function shapeTerm(t) {
  if (Array.isArray(t)) return rdf.literal(t[0], t[2] || (t[1] ? N(t[1]) : undefined))
  return t.startsWith('_:') ? rdf.blankNode(t.slice(2)) : N(t)
}
const shapeQuads = shapes.map(row => rdf.quad(...row.map(shapeTerm)))

function pythonRepr(x) {
  if (x === null) return 'None'
  if (typeof x === 'string') return "'" + x.replaceAll('\\', '\\\\').replaceAll("'", "\\'") + "'"
  if (Array.isArray(x)) return '[' + x.map(pythonRepr).join(', ') + ']'
  if (isObject(x)) return '{' + Object.entries(x).map(([k,v]) => pythonRepr(k) + ': ' + pythonRepr(v)).join(', ') + '}'
  if (typeof x === 'boolean') return x ? 'True' : 'False'
  return String(x)
}

function entityLabel(entity) {
  const identifier = Object.hasOwn(entity,'@id') ? entity['@id'] : entity
  return typeof identifier === 'string' ? identifier : pythonRepr(identifier)
}

function flattened(value, err) {
  if (Array.isArray(value)) return value.map(v => flattened(v, err)).every(Boolean)
  if (!isObject(value)) return true
  const label = entityLabel(value)
  const message = msg => err('entity "' + label + '" ' + msg)
  let ok = true
  if ('@value' in value) {
    if ('@id' in value) {
      message('contains both @id and @value: an object with an @value represents a value object, which is a literal value such as a string, number, date, or language-tagged string. This object is not an identifiable resource, but a simple literal value.')
      ok = false
    }
    if ('@language' in value && '@type' in value) {
      message('is not a valid value object: @language and @type cannot coexist.')
      ok = false
    }
    if ('@language' in value && typeof value['@value'] !== 'string') {
      message('is not a valid value object: if @language is present, @value must be a string.')
      ok = false
    }
  } else if (!('@id' in value) || Object.keys(value).length > 1) {
    message('is not a valid node object reference: it MUST have only @id, but no other properties.')
    ok = false
  }
  return ok
}

async function baseFormat(doc, ws, opts, err) {
  if (Array.isArray(doc)) {
    err("Unexpected error: 'list' object has no attribute 'keys'")
    err('RO-Crate file descriptor "' + FILENAME + '" does not contain a context')
    return
  }
  const names = new Set(SPECIAL_KEYS)
  async function getTerms(ctx) {
    if (typeof ctx === 'string') ctx = (await opts.documentLoader(ctx)).document['@context']
    if (Array.isArray(ctx)) { for (const item of ctx) await getTerms(item) }
    else if (isObject(ctx)) for (const k of Object.keys(ctx)) names.add(k)
  }
  if (!('@context' in doc)) err('RO-Crate file descriptor "' + FILENAME + '" does not contain a context')
  else await getTerms(doc['@context'])
  const entities = Array.isArray(doc['@graph']) ? doc['@graph'] : []
  const unknown = new Map()
  function countKeys(x) {
    if (Array.isArray(x)) x.forEach(countKeys)
    else if (isObject(x)) for (const [k,v] of Object.entries(x)) {
      if (!names.has(k)) unknown.set(k, (unknown.get(k) ?? 0) + 1)
      countKeys(v)
    }
  }
  if (doc['@context'] == null && entities.some(e => Object.keys(e).some(k => !SPECIAL_KEYS.has(k)))) {
    err("Unexpected error: argument of type 'NoneType' is not iterable")
  } else countKeys(entities)
  for (const [key,count] of unknown) {
    const s = count > 1 ? 's' : ''
    err(key.startsWith('http') ?
      'The The ' + count + ' occurrence' + s + ' of the "' + key + '" URI cannot be used as a key' + s + ' "because the compacted format requires simple terms as keys (see https://www.w3.org/TR/json-ld-api/#compaction for more details).' :
      'The ' + count + ' occurrence' + s + ' of the JSON-LD key "' + key + '" ' + (s ? 'are' : 'is') + ' not allowed in the compacted format because it is not present in the @context of the document')
  }
  for (const entity of entities) {
    if (!isObject(entity)) continue
    if (!Object.values(entity).map(v => flattened(v, err)).every(Boolean))
      err('RO-Crate file descriptor "' + FILENAME + '" is not fully flattened at entity "' + entityLabel(entity) + '"')
    const types = [entity['@type']].flat()
    const id = entity['@id']
    if (typeof id === 'string' && (types.includes('File') || types.includes('Dataset')) &&
        !/^(#|\/|https?:|ftps?:|file:)/i.test(id) && !ws.has(decodeURIComponent(id))) {
      err("The RO-Crate does not include the Data Entity '" + id + "' as part of its payload")
    }
  }
  for (const key of ['@id', '@type']) {
    const missing = entities.find(entity => isObject(entity) && !(key in entity))
    if (missing) err('Entity "' + (missing.name || pythonRepr(missing)) + '" of RO-Crate "' + FILENAME + '" file descriptor does not contain the ' + key + ' attribute')
  }
}

// The two upstream parsers expand relative fragment IDs against different bases.
export async function validateBase(doc, _referenceQuads, ws, issues, opts) {
  const err = (message, location_description = null) => issues.push({message, severity:40, location_description})
  await baseFormat(doc, ws, opts, err)
  if (Array.isArray(doc)) return
  const rootURL = new URL('.', opts.baseURL).href
  const quads = await rdfDataset(doc, opts, rootURL)
  const graph = rdf.dataset(quads.filter(q => q.graph.termType === 'DefaultGraph').map(q => rdf.quad(rdf.fromTerm(q.subject), rdf.fromTerm(q.predicate), rdf.fromTerm(q.object))))
  const supportedOWL = new Set(['equivalentClass', 'equivalentProperty', 'inverseOf', 'propertyChainAxiom',
    'versionInfo', 'versionIRI', 'priorVersion', 'backwardCompatibleWith', 'incompatibleWith', 'deprecated'])
  // Annotation predicates have no entailment effect. Supported property rules
  // materialize before the profile's class hierarchy and target selection.
  for (const q of graph) {
    const predicate = q.predicate.value
    if ((predicate.startsWith(OWL) && !supportedOWL.has(predicate.slice(OWL.length))) ||
        (predicate === TYPE && q.object.value.startsWith(OWL) && ![OWL+'Class',OWL+'NamedIndividual',OWL+'Ontology'].includes(q.object.value))) {
      throw new Error('Crate declares an ontology inference rule outside the bundled BIA profile: ' + predicate)
    }
  }
  materializeProperties(graph, rdf)
  const rules = rdf.dataset(shapeQuads)
  const triple = (s,p,o) => graph.add(rdf.quad(s,N(p),N(o)))
  const objects = (s,p) => [...graph.match(s,N(p))].map(q => q.object)
  const typed = (s,t) => graph.has(rdf.quad(s,N(TYPE),N(t)))
  const type = (s,t) => { if (s.termType !== 'Literal') triple(s,TYPE,PROFILE+t) }
  const target = (shape,s) => rules.add(rdf.quad(N(PROFILE+shape),N(SH+'targetNode'),s))
  // Resolve class declarations in the crate together with the fixed profile ontology.
  const subclass = RDFS+'subClassOf'
  const parents = new Map()
  const edge = (child,parent) => {
    if (!parents.has(child)) parents.set(child,new Set())
    parents.get(child).add(parent)
  }
  for (const [a,b] of [
    [PROFILE+'File',SCHEMA+'MediaObject'], [SCHEMA+'MediaObject',PROFILE+'File'],
    [SCHEMA+'SoftwareSourceCode',SCHEMA+'CreativeWork'], [PROFILE+'RootDataEntity',SCHEMA+'Dataset'],
    [PROFILE+'Directory',SCHEMA+'Dataset'], [PROFILE+'DataEntity',SCHEMA+'CreativeWork']
  ]) edge(a,b)
  for (const q of graph.match(null,N(subclass))) edge(q.subject.value,q.object.value)
  for (const q of graph.match(null,N(OWL+'equivalentClass'))) {
    edge(q.subject.value,q.object.value)
    edge(q.object.value,q.subject.value)
  }
  for (const q of [...graph.match(null,N(TYPE))]) {
    const pending = [q.object.value]
    const seen = new Set()
    while (pending.length) {
      const cls = pending.pop()
      if (seen.has(cls)) continue
      seen.add(cls)
      for (const parent of parents.get(cls) ?? []) {
        triple(q.subject,TYPE,parent)
        pending.push(parent)
      }
    }
  }
  const subjects = [...new Map([...graph].map(q => [q.subject.value,q.subject])).values()]
  const abouts = []
  for (const s of subjects) {
    if (typed(s,SCHEMA+'MediaObject') && /^(https?|ftps?):\/\//i.test(s.value) && s.value !== opts.baseURL) type(s,'WebDataEntity')
    if (s.value.includes(FILENAME)) {
      if (typed(s,SCHEMA+'CreativeWork')) type(s,'ROCrateMetadataFileDescriptor')
      abouts.push(...objects(s,SCHEMA+'about'))
    }
    for (const obj of objects(s,SCHEMA+'license')) type(obj,'ContextualEntity')
    for (const obj of objects(s,SCHEMA+'author')) if (typed(obj,SCHEMA+'Person')) type(obj,'CreativeWorkAuthor')
  }
  for (const root of abouts) {
    target('RootDataEntityType',root)
    if (typed(root,SCHEMA+'Dataset')) type(root,'RootDataEntity')
    for (const obj of objects(root,SCHEMA+'hasPart')) {
      if (obj.equals(root) || obj.value === opts.baseURL || (typed(obj,SCHEMA+'Dataset') && typed(obj,SCHEMA+'MediaObject'))) continue
      type(obj,'GenericDataEntity')
      type(obj,'DataEntity')
    }
    for (const s of subjects) {
      if (s.value.startsWith(root.value+'#')) continue
      if (typed(s,SCHEMA+'MediaObject')) {
        target('FileDataEntity',s)
        type(s,'DataEntity')
      }
      if (typed(s,SCHEMA+'Dataset') && !s.equals(root)) {
        target('DirectoryDataEntity',s)
        type(s,'Directory')
        type(s,'DataEntity')
      }
    }
  }
  const result = await new SHACLValidator(rules).validate(graph)
  const reported = new Set()
  for (const row of result.results) {
    const location = row.focusNode.value.replace(rootURL,'./')
    let message = row.message[0]?.value ?? 'ro-crate shacl validation failed without message.'
    if (row.path?.termType === 'BlankNode' && row.sourceConstraintComponent.value === SH+'MinCountConstraintComponent' && message === 'Less than 1 values') {
      const focus = row.focusNode.value.replace(rootURL,'file://.//')
      message += ' on <' + focus + '>->[ sh:inversePath <' + SCHEMA + 'hasPart> ]'
    }
    // roc-validator coalesces identical results of components on one property shape.
    const key = JSON.stringify([row.sourceShape.value, location, row.value?.value, message])
    if (reported.has(key)) continue
    reported.add(key)
    err(message, 'At ro-crate object with @id: ' + location)
  }
}

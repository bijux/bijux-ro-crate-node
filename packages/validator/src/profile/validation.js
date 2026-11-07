// Pinned translation of the REQUIRED procedurally evaluated checks and SHACL-AF
// targets/rules from roc-validator 0.8.1. The property constraints are generated.
import {rdfDataset} from '../metadata/rdf/dataset.js'
import SHACLValidator from 'rdf-validate-shacl'
import rdf from 'rdf-validate-shacl/src/defaultEnv.js'
import shapes from './shapes.json' with {type: 'json'}
import {validateFormat} from './format.js'
import {materializeProfile} from './inference/closure.js'
import {classMembership} from './inference/classes.js'

const FILENAME = 'ro-crate-metadata.json'
const SCHEMA = 'http://schema.org/'
const TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const PROFILE = 'https://github.com/crs4/rocrate-validator/profiles/ro-crate/'
const SH = 'http://www.w3.org/ns/shacl#'
const N = value => rdf.namedNode(value)

function shapeTerm(t) {
  if (Array.isArray(t)) return rdf.literal(t[0], t[2] || (t[1] ? N(t[1]) : undefined))
  return t.startsWith('_:') ? rdf.blankNode(t.slice(2)) : N(t)
}
const shapeQuads = shapes.map(row => rdf.quad(...row.map(shapeTerm)))

// The two upstream parsers expand relative fragment IDs against different bases.
export async function validateBaseProfile(doc, ws, issues, opts) {
  const err = (message, location_description = null) => issues.push({message, severity:40, location_description})
  await validateFormat(doc, ws, opts, err)
  if (Array.isArray(doc)) return
  const rootURL = new URL('.', opts.baseURL).href
  const quads = await rdfDataset(doc, opts, rootURL)
  const graph = rdf.dataset(quads.filter(q => q.graph.termType === 'DefaultGraph').map(q => rdf.quad(rdf.fromTerm(q.subject), rdf.fromTerm(q.predicate), rdf.fromTerm(q.object))))
  const inference = materializeProfile(graph, rdf)
  const rules = rdf.dataset(shapeQuads)
  const triple = (s,p,o) => graph.add(rdf.quad(s,N(p),N(o)))
  const objects = (s,p) => [...graph.match(s,N(p))].map(q => q.object)
  const typed = (s,t) => graph.has(rdf.quad(s,N(TYPE),N(t)))
  const type = (s,t) => { if (s.termType !== 'Literal') triple(s,TYPE,PROFILE+t) }
  const target = (shape,s) => rules.add(rdf.quad(N(PROFILE+shape),N(SH+'targetNode'),s))
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
  inference.close([classMembership])
  // Every membership is materialized, including targets added above. The
  // SHACL engine recursively follows subclass edges without cycle detection;
  // the required profile never constrains those predicates directly.
  const validationGraph = rdf.dataset([...graph].filter(q => q.predicate.value !== 'http://www.w3.org/2000/01/rdf-schema#subClassOf'))
  const result = await new SHACLValidator(rules).validate(validationGraph)
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

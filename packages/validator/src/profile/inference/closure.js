import {inferenceDataset, RDFS} from './dataset.js'
import {propertyRules} from './properties.js'
import {classRules} from './classes.js'
import {identityRules} from './identity.js'

const SCHEMA = 'http://schema.org/'
const PROFILE = 'https://github.com/crs4/rocrate-validator/profiles/ro-crate/'

/** Materialize the ontology memberships consumed by the required BIA profile. */
export function materializeProfile(graph, rdf, options) {
  for (const [child, parent] of [
    [PROFILE + 'File', SCHEMA + 'MediaObject'], [SCHEMA + 'MediaObject', PROFILE + 'File'],
    [SCHEMA + 'SoftwareSourceCode', SCHEMA + 'CreativeWork'], [PROFILE + 'RootDataEntity', SCHEMA + 'Dataset'],
    [PROFILE + 'Directory', SCHEMA + 'Dataset'], [PROFILE + 'DataEntity', SCHEMA + 'CreativeWork'],
  ]) graph.add(rdf.quad(rdf.namedNode(child), rdf.namedNode(RDFS + 'subClassOf'), rdf.namedNode(parent)))
  const inference = inferenceDataset(graph, rdf, options)
  inference.close([propertyRules, classRules, identityRules])
  return inference
}

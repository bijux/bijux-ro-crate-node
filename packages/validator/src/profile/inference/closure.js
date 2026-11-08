import {referenceCardinalityValue} from '../../metadata/rdf/literals/numeric-values.js'
import {inferenceDataset} from './dataset.js'
import {materializeDatatypes, datatypeErrorMessages} from './datatypes.js'
import {materializeAxioms} from './axioms.js'
import {propertyRules} from './properties.js'
import {classRules} from './classes.js'
import {identityRules} from './identity.js'
import {inconsistencyMessages, emitInconsistencies} from './errors.js'
import {schemaRules} from './schema.js'
import ontology from '../ontology.json' with {type: 'json'}

/** Materialize the ontology memberships consumed by the required BIA profile. */
export function materializeProfile(graph, rdf, options) {
  const term = value => Array.isArray(value) ? rdf.literal(value[0], value[2] || (value[1] ? rdf.namedNode(value[1]) : undefined)) : rdf.namedNode(value)
  for (const row of ontology) graph.add(rdf.quad(...row.map(term)))
  const inference = inferenceDataset(graph, rdf, {literalValue: term => referenceCardinalityValue([], term), ...options})
  materializeAxioms(inference)
  const errors = datatypeErrorMessages(inference)
  materializeDatatypes(inference)
  inference.close([propertyRules, classRules, identityRules, schemaRules])
  for (const message of inconsistencyMessages(inference)) errors.add(message)
  inference.removeBlankPredicates()
  inference.errors = emitInconsistencies(inference, rdf, errors, options?.rootURL)
  return inference
}

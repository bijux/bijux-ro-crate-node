import {referenceCardinalityValue} from '../../metadata/rdf/literals/numeric-values.js'
import {inferenceDataset} from './dataset.js'
import type {Dataset, RDFEnvironment, InferenceOptions, Inference, Term} from './dataset.js'
import {materializeDatatypes, datatypeErrorMessages} from './datatypes.js'
import {materializeAxioms} from './axioms.js'
import {propertyRules} from './properties.js'
import {classRules} from './classes.js'
import {identityRules} from './identity.js'
import {inconsistencyMessages, emitInconsistencies} from './errors.js'
import {schemaRules} from './schema.js'
import ontology from '../ontology.json' with {type: 'json'}

interface ProfileRDF extends RDFEnvironment {blankNode(value: string): Term; literal(value: string, languageOrDatatype?: string | Term): Term}
interface ProfileOptions extends InferenceOptions {rootURL?: string}

/** Materialize the ontology memberships consumed by the required BIA profile. */
export function materializeProfile(graph: Dataset, rdf: ProfileRDF, options?: ProfileOptions) {
  const term = (value: string | (string | null)[]) => Array.isArray(value) ? rdf.literal(value[0] as string, value[2] || (value[1] ? rdf.namedNode(value[1]) : undefined)) : rdf.namedNode(value)
  // The bundled ontology stores triples as three-term rows.
  for (const row of ontology) graph.add(rdf.quad(...row.map(term) as [Term, Term, Term]))
  const inference = inferenceDataset(graph, rdf, {literalValue: term => referenceCardinalityValue([], term), ...options}) as Inference & {errors?: ReturnType<typeof emitInconsistencies>}
  materializeAxioms(inference)
  const errors = datatypeErrorMessages(inference)
  materializeDatatypes(inference)
  inference.close([propertyRules, classRules, identityRules, schemaRules])
  for (const message of inconsistencyMessages(inference)) errors.add(message)
  inference.removeBlankPredicates()
  inference.errors = emitInconsistencies(inference, rdf, errors, options?.rootURL)
  return inference as Inference & {errors: ReturnType<typeof emitInconsistencies>}
}

import type {ValidationIssue} from '@bijux/ro-crate-core'
import type {ContextOptions} from './context.js'
import {rdfDataset} from './dataset.js'
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const CONFORMS_TO = 'http://purl.org/dc/terms/conformsTo';
function issue(issues: ValidationIssue[], message: string, location_description: string | null = null, severity: ValidationIssue['severity'] = 40) {
  issues.push({ message, severity, location_description });
}

/** Apply the same global URI-reference subtraction as RDFLib's pre-parse check. */
export async function checkReferences(document: unknown, issues: ValidationIssue[], options: ContextOptions = {}) {
  // The reference preflight parses an RDFLib Graph, whose queries see only the
  // default graph. Named graph terms must not alter references or list checks.
  const dataset = (await rdfDataset(document, options)).filter(quad => quad.graph.termType === 'DefaultGraph');
  const subjects = new Set<string>();
  const objects = new Set<string>();
  const external = new Set<string>();
  for (const quad of dataset) {
    if (quad.subject.termType === 'NamedNode') subjects.add(quad.subject.value);
    if (quad.object.termType !== 'NamedNode') continue;
    objects.add(quad.object.value);
    if (quad.predicate.value === RDF_TYPE || quad.predicate.value === CONFORMS_TO) external.add(quad.object.value);
  }
  for (const value of external) objects.delete(value);
  const inboundless = [...subjects].filter(value => !objects.has(value) && value !== (options.baseURL ?? 'file:///crate/ro-crate-metadata.json')).sort();
  const undefinedReferences = [...objects].filter(value => !subjects.has(value));
  if (inboundless.length) issue(issues, `Found objects in ro-crate-metadata.json with no inbound references: ${inboundless.join(', ')}`, null, 20);
  if (undefinedReferences.length) issue(issues, `Found undefined references: ${undefinedReferences.join(', ')}`);
  return dataset;
}

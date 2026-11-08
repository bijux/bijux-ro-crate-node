export {rootNamespaceFormatter} from './namespaces/context.js';
const formatters = new WeakMap();

export function withNamespaces(dataset, formatter) {
  formatters.set(dataset, formatter);
  return dataset;
}

export function namespaceLabel(dataset, iri) {
  const formatter = formatters.get(dataset);
  if (!formatter) throw new Error('RDF dataset has no namespace bindings');
  return formatter.format(iri);
}

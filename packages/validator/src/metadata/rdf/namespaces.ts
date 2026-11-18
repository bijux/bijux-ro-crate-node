export {rootNamespaceFormatter} from './namespaces/context.js';
const formatters = new WeakMap<object, {format(iri: string): string}>();

export function withNamespaces<T extends object>(dataset: T, formatter: {format(iri: string): string}): T {
  formatters.set(dataset, formatter);
  return dataset;
}

export function namespaceLabel(dataset: object, iri: string) {
  const formatter = formatters.get(dataset);
  if (!formatter) throw new Error('RDF dataset has no namespace bindings');
  return formatter.format(iri);
}

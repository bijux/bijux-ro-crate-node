import {jsonldValue} from '../json/jsonld-values.js';
import {jsonld, rdfOptions} from '../jsonld.js';
import {rootContextPropagates} from './context.js';
import {referenceNodeIdentifiers} from './node-identifiers.js';
import {canonicalLiteral} from './literals/canonical.js';
import {RDFNumber, RDFJSON, isFloatAt} from '../json/number-kinds.js';
import {jsonLiteralText} from '../json/serialize.js';
import {sourceKeys} from '../json/ordered-members.js';
import {withNumericValues, referenceCardinalityValue} from './literals/numeric-values.js';
import {withDatatypeAliases} from './literals/datatype-aliases.js';
import {contextState, isEmptyNodeContext, nodeContext, propertyContext} from './scopes.js';
import {physicalBaseGuard} from './physical-base.js';
import {rootNamespaceFormatter, withNamespaces} from './namespaces.js';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const XSD_DOUBLE = 'http://www.w3.org/2001/XMLSchema#double';
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  !(value instanceof RDFNumber || value instanceof RDFJSON);
const numberValue = (value, parent, key, datatype) => new RDFNumber(value,
  typeof value === 'number' && (isFloatAt(parent, key) || !Number.isInteger(value)), datatype);
const typeValues = (value, parent, key) => Array.isArray(value)
  ? value.flatMap((item, index) => typeValues(item, value, index))
  : [typeof value === 'number' || typeof value === 'bigint' ? numberValue(value, parent, key) : value];

/** RDFLib tolerates non-string node IDs and null graphs before PyLD model parsing. */
export async function rdfDataset(document, options = {}, base = options.baseURL ?? 'file:///crate/ro-crate-metadata.json') {
  const guard = physicalBaseGuard(base, new URL('.', options.baseURL ?? base).href);
  options = {...options, rdfPhysicalRoot: guard};
  // RDFLib dereferences a missing parent for this root context. Preserve the
  // processor's actual propagation semantics instead of reproducing that crash.
  const nonpropagatingRoot = isObject(document) &&
    !await rootContextPropagates(document['@context'], options);
  const initialContext = await jsonld.processContext(null, null, rdfOptions(options));
  const namespaces = await rootNamespaceFormatter(document, options, base);
  let malformedDatatype = 'urn:bijux:rdflib-malformed-datatype';
  const originalJSON = JSON.stringify(jsonldValue(document));
  while (originalJSON?.includes(malformedDatatype)) malformedDatatype += '-';
  let hasMalformedTypes = false;
  const memberOrders = new WeakMap();
  const nativeTypes = new Map();
  const nativeMarkers = new Map();
  const nativeValues = new Map();
  const expandType = (type, context) => {
    const colon = type.indexOf(':');
    return context.mappings.get(type)?.['@id'] ??
      (colon >= 0 && context.mappings.get(type.slice(0, colon))?.['@id']
        ? context.mappings.get(type.slice(0, colon))['@id'] + type.slice(colon + 1) : type);
  };
  async function rdfInput(value, state, parent, parentKey, coercion, mapContainer = null, indexedType = null) {
    if (coercion === '@json') return new RDFJSON(jsonLiteralText(value, parent, parentKey));
    if (typeof value === 'number' || typeof value === 'bigint')
      return numberValue(value, parent, parentKey, coercion === '@vocab' ? '' : undefined);
    if (Array.isArray(value)) return Promise.all(value.map((item, index) => rdfInput(item, state, value, index, coercion, null, indexedType)));
    if (!isObject(value)) return value;
    if (mapContainer) {
      // Index names belong to the map; language-map values remain literal data.
      const result = Object.create(null);
      for (const key of sourceKeys(value)) {
        // @none belongs to the outer map, before a value's local context.
        const indexedType = mapContainer === '@type' && key !== '@none' &&
          state.active.mappings.get(key)?.['@id'] !== '@none' ? key : null;
        result[key] = mapContainer === '@language' ? structuredClone(value[key])
          : await rdfInput(value[key], state, value, key, coercion, null, indexedType);
      }
      memberOrders.set(result, sourceKeys(value));
      return result;
    }
    const literal = Object.keys(value).some(key =>
      (key.startsWith('@') ? key : state.active.mappings.get(key)?.['@id']) === '@value');
    state = await nodeContext(state, value, options, value === document && nonpropagatingRoot, indexedType);
    const activeContext = state.active;
    const expandKey = key => key.startsWith('@') ? key : activeContext.mappings.get(key)?.['@id'];
    const valueKey = Object.keys(value).find(key => expandKey(key) === '@value');
    const typeKey = Object.keys(value).find(key => expandKey(key) === '@type');
    if (typeKey !== undefined && typeof value[typeKey] === 'string' && expandType(value[typeKey], activeContext) === '@json' && valueKey !== undefined) {
      const result = structuredClone(value);
      if (literal) delete result['@context'];
      result[valueKey] = new RDFJSON(jsonLiteralText(value[valueKey], value, valueKey));
      return result;
    }
    const result = Object.create(null);
    for (const key of sourceKeys(value)) {
      const child = value[key];
      const expandedKey = key.startsWith('@') ? key : activeContext.mappings.get(key)?.['@id'];
      if (key === '@context') {
        // Literal-local contexts are ignored; empty node contexts reset inherited terms.
        if (!literal) result[key] = isEmptyNodeContext(child)
          ? null : structuredClone(child);
      }
      else if (expandedKey === '@id' && typeof child !== 'string') continue;
      else if (expandedKey === '@graph' && !isObject(child) && !Array.isArray(child)) result[key] = [];
      // RDFLib does not flatten arrays inside the graph's node collection.
      // Keep format validation responsible for their structural diagnostics.
      else if (expandedKey === '@graph' && Array.isArray(child))
        result[key] = await rdfInput(child.filter(item => !Array.isArray(item)), state);
      else if (expandedKey === '@type' && (Array.isArray(child) ? child : [child]).some(item => typeof item !== 'string')) {
        const values = typeValues(child, value, key);
        result[key] = values.filter(item => typeof item === 'string');
        const malformedTypes = [];
        for (const item of values) {
          if (item === null || typeof item === 'string') continue;
          if (isObject(item)) malformedTypes.push(await rdfInput(item, state));
          else {
            hasMalformedTypes = true;
            malformedTypes.push({ '@value': item, '@type': malformedDatatype });
          }
        }
        if (malformedTypes.length) result[RDF_TYPE] = [...(result[RDF_TYPE] ?? []), ...malformedTypes];
      }
      else if (key === RDF_TYPE && own(result, key)) result[key] = [...result[key], ...[await rdfInput(child, state, value, key)].flat()];
      else {
        const mapping = activeContext.mappings.get(key);
        const container = mapping?.['@container'] ?? [];
        const mapContainer = isObject(child) && !container.includes('@graph')
          ? ['@type', '@index', '@id', '@language'].find(kind => container.includes(kind)) : null;
        result[key] = await rdfInput(child, await propertyContext(state, mapping, options),
          value, key, mapping?.['@type'], mapContainer);
      }
    }
    memberOrders.set(result, [...new Set([...sourceKeys(value), ...Object.keys(result)])]
      .filter(key => own(result, key)));
    return result;
  }
  // Equal RDF triples can carry different Python constructor values. Preserve
  // the first source occurrence when aliases expand to the same predicate.
  const expansionOptions = {...rdfOptions(options), base,
    rdfLibInputOrder: value => memberOrders.get(value) ?? Object.keys(value)};
  async function expandDocument() {
    if (nonpropagatingRoot) expansionOptions.rdfRootPropagation = {pending: true, contexts: new WeakSet()};
    return jsonld.expand(await rdfInput(document, contextState(initialContext)), expansionOptions);
  }
  let expanded = await expandDocument();
  if (hasMalformedTypes) {
    // Context prefixes can assemble an IRI absent from the input JSON. Reserve
    // against expanded IRIs before using a synthetic malformed-type datatype.
    const reserved = JSON.stringify(expanded);
    while (reserved.includes(malformedDatatype)) malformedDatatype += '-';
    expanded = await expandDocument();
  }
  const expandedJSON = JSON.stringify(expanded);
  let emptyDatatype = 'urn:bijux:rdflib-literal-datatype';
  while (expandedJSON.includes(emptyDatatype)) emptyDatatype += '-';
  const lexicalDouble = emptyDatatype + '-double';
  const emptyIRIDatatype = emptyDatatype + '-empty-iri';
  // RDFLib keeps an untyped string distinct from explicit xsd:string. After
  // expansion, context-coerced types are explicit too, so both are preserved.
  function retainLiteralIdentity(value) {
    if (Array.isArray(value)) return value.forEach(retainLiteralIdentity);
    if (!isObject(value)) return;
    if (own(value, '@value')) {
      const native = value['@type'] === '@json' && !(value['@value'] instanceof RDFJSON)
        ? new RDFJSON(jsonLiteralText(value['@value'])) : value['@value'];
      if (native instanceof RDFNumber || native instanceof RDFJSON || typeof native === 'boolean') {
        let type = native instanceof RDFJSON ? 'http://www.w3.org/1999/02/22-rdf-syntax-ns#JSON' :
          value['@type'] ?? native.datatype ?? 'http://www.w3.org/2001/XMLSchema#' + (typeof native === 'boolean' ? 'boolean' : native.floating ? 'double' : 'integer');
        if (type === '') type = emptyIRIDatatype;
        if (!nativeMarkers.has(type)) {
          const marker = emptyDatatype + '-native-' + nativeTypes.size;
          nativeMarkers.set(type, marker);
          nativeTypes.set(marker, type);
        }
        if (!(native instanceof RDFJSON)) nativeValues.set(nativeMarkers.get(type) + '\0' + String(native), Number(native));
        value['@value'] = String(native);
        value['@type'] = nativeMarkers.get(type);
        return;
      }
      if (value['@type'] === '') value['@type'] = emptyIRIDatatype;
      if (typeof native === 'number') throw new TypeError('JSON-LD discarded native numeric identity');
      if (typeof value['@value'] === 'string' && value['@type'] === XSD_DOUBLE)
        value['@type'] = lexicalDouble;
      if (typeof value['@value'] === 'string' && !own(value, '@type') && !own(value, '@language'))
        value['@type'] = emptyDatatype;
      return;
    }
    Object.values(value).forEach(retainLiteralIdentity);
  }
  retainLiteralIdentity(expanded);
  const identifiers = referenceNodeIdentifiers(expanded);
  const dataset = await jsonld.toRDF(expanded, {...expansionOptions, skipExpansion: true, rdfLibBlankNodeIssuer: identifiers.issuer});
  identifiers.restoreBareIdentifier(dataset);
  guard.assertConsumed(dataset);
  const nativeLiterals = new Set();
  const numericValues = new Map();
  for (const quad of dataset) {
    if (quad.object.termType === 'Literal' && nativeTypes.has(quad.object.datatype.value)) {
      const key = quad.object.datatype.value + '\0' + quad.object.value;
      if (nativeValues.has(key)) numericValues.set(quad.object, nativeValues.get(key));
      quad.object.datatype.value = nativeTypes.get(quad.object.datatype.value);
      nativeLiterals.add(quad.object);
    }
    if (quad.object.termType === 'Literal' && hasMalformedTypes &&
        quad.object.datatype.value === malformedDatatype) quad.object.datatype.value = emptyIRIDatatype;
    if (quad.object.termType === 'Literal' && quad.object.datatype.value === emptyDatatype) quad.object.datatype.value = '';
    if (quad.object.termType === 'Literal' && quad.object.datatype.value === lexicalDouble) quad.object.datatype.value = XSD_DOUBLE;
  }
  for (const quad of dataset) {
    if (quad.object.termType === 'Literal' && !nativeLiterals.has(quad.object)) quad.object.value = canonicalLiteral(quad.object);
  }
  const termIdentity = term => [term.termType, term.value, term.datatype?.value, term.language?.toLowerCase()];
  const unique = new Map();
  const literals = [];
  for (const quad of dataset) {
    const key = JSON.stringify([quad.subject, quad.predicate, quad.object, quad.graph].map(termIdentity));
    if (!unique.has(key)) {
      unique.set(key, quad);
      if (quad.object.termType === 'Literal')
        literals.push([quad, numericValues.has(quad.object) ? numericValues.get(quad.object) : referenceCardinalityValue([], quad.object)]);
    }
  }
  return withNamespaces(withNumericValues(withDatatypeAliases([...unique.values()], new Map([[emptyIRIDatatype, '']])), literals), namespaces);
}

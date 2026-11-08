import {jsonldValue} from '../json/jsonld-values.js';
import {jsonld, jsonldOptions} from '../jsonld.js';
import {rootContextPropagates} from './context.js';
import {canonicalLiteral} from './literals/canonical.js';
import {RDFNumber, RDFJSON, isFloatAt} from '../json/number-kinds.js';
import {jsonLiteralText} from '../json/serialize.js';
import {withDatatypeAliases} from './literals/datatype-aliases.js';
import {contextState, nodeContext, propertyContext} from './scopes.js';
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
  // The root has no parent for RDFLib's nonpropagating context fallback.
  // Nested contexts do have a parent and must continue through normal parsing.
  if (isObject(document) && !document['@value'] &&
      !await rootContextPropagates(document['@context'], options))
    throw new TypeError("'NoneType' object has no attribute 'get_id'");
  const initialContext = await jsonld.processContext(null, null, jsonldOptions(options));
  let malformedDatatype = 'urn:bijux:rdflib-malformed-datatype';
  const originalJSON = JSON.stringify(jsonldValue(document));
  while (originalJSON?.includes(malformedDatatype)) malformedDatatype += '-';
  let hasMalformedTypes = false;
  const nativeTypes = new Map();
  const nativeMarkers = new Map();
  const expandType = (type, context) => {
    const colon = type.indexOf(':');
    return context.mappings.get(type)?.['@id'] ??
      (colon >= 0 && context.mappings.get(type.slice(0, colon))?.['@id']
        ? context.mappings.get(type.slice(0, colon))['@id'] + type.slice(colon + 1) : type);
  };
  async function rdfInput(value, state, parent, parentKey, coercion) {
    if (coercion === '@json') return new RDFJSON(jsonLiteralText(value, parent, parentKey));
    if (typeof value === 'number' || typeof value === 'bigint')
      return numberValue(value, parent, parentKey, coercion === '@vocab' ? '' : undefined);
    if (Array.isArray(value)) return Promise.all(value.map((item, index) => rdfInput(item, state, value, index, coercion)));
    if (!isObject(value)) return value;
    state = await nodeContext(state, value, options);
    const activeContext = state.active;
    const expandKey = key => key.startsWith('@') ? key : activeContext.mappings.get(key)?.['@id'];
    const valueKey = Object.keys(value).find(key => expandKey(key) === '@value');
    const typeKey = Object.keys(value).find(key => expandKey(key) === '@type');
    if (typeof value[typeKey] === 'string' && expandType(value[typeKey], activeContext) === '@json' && valueKey !== undefined) {
      const result = structuredClone(value);
      result[valueKey] = new RDFJSON(jsonLiteralText(value[valueKey], value, valueKey));
      return result;
    }
    const result = Object.create(null);
    for (const [key, child] of Object.entries(value)) {
      const expandedKey = key.startsWith('@') ? key : activeContext.mappings.get(key)?.['@id'];
      if (key === '@context') result[key] = structuredClone(child);
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
        result[key] = await rdfInput(child, await propertyContext(state, mapping, options), value, key, mapping?.['@type']);
      }
    }
    return result;
  }
  const expansionOptions = {...jsonldOptions(options), base, rdfLibTypeScopes: true};
  let expanded = await jsonld.expand(await rdfInput(document, contextState(initialContext)), expansionOptions);
  if (hasMalformedTypes) {
    // Context prefixes can assemble an IRI absent from the input JSON. Reserve
    // against expanded IRIs before using a synthetic malformed-type datatype.
    const reserved = JSON.stringify(expanded);
    while (reserved.includes(malformedDatatype)) malformedDatatype += '-';
    expanded = await jsonld.expand(await rdfInput(document, contextState(initialContext)), expansionOptions);
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
      if (native instanceof RDFNumber || native instanceof RDFJSON) {
        let type = native instanceof RDFJSON ? 'http://www.w3.org/1999/02/22-rdf-syntax-ns#JSON' :
          value['@type'] ?? native.datatype ?? 'http://www.w3.org/2001/XMLSchema#' + (native.floating ? 'double' : 'integer');
        if (type === '') type = emptyIRIDatatype;
        if (!nativeMarkers.has(type)) {
          const marker = emptyDatatype + '-native-' + nativeTypes.size;
          nativeMarkers.set(type, marker);
          nativeTypes.set(marker, type);
        }
        value['@value'] = String(native);
        value['@type'] = nativeMarkers.get(type);
        return;
      }
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
  const dataset = await jsonld.toRDF(expanded, {...expansionOptions, skipExpansion: true});
  const nativeLiterals = new Set();
  for (const quad of dataset) {
    if (quad.object.termType === 'Literal' && nativeTypes.has(quad.object.datatype.value)) {
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
  for (const quad of dataset) {
    const key = JSON.stringify([quad.subject, quad.predicate, quad.object, quad.graph].map(termIdentity));
    if (!unique.has(key)) unique.set(key, quad);
  }
  return withDatatypeAliases([...unique.values()], new Map([[emptyIRIDatatype, '']]));
}

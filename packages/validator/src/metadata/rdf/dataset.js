import {jsonldValue} from '../numbers.js';
import {jsonld, jsonldOptions} from '../jsonld.js';
import {rootContextPropagates} from './context.js';
import {canonicalLiteral} from './literals/canonical.js';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const XSD_DOUBLE = 'http://www.w3.org/2001/XMLSchema#double';
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** RDFLib tolerates non-string node IDs and null graphs before PyLD model parsing. */
export async function rdfDataset(document, options = {}, base = options.baseURL ?? 'file:///crate/ro-crate-metadata.json') {
  // The root has no parent for RDFLib's nonpropagating context fallback.
  // Nested contexts do have a parent and must continue through normal parsing.
  if (isObject(document) && !document['@value'] &&
      !await rootContextPropagates(document['@context'], options))
    throw new TypeError("'NoneType' object has no attribute 'get_id'");
  const initialContext = await jsonld.processContext(null, null, jsonldOptions(options));
  let emptyDatatype = 'urn:bia-ro-crate-validator:rdflib-empty-datatype';
  const originalJSON = JSON.stringify(jsonldValue(document));
  while (originalJSON?.includes(emptyDatatype)) emptyDatatype += '-';
  const lexicalDouble = emptyDatatype + '-double';
  async function rdfInput(value, activeContext) {
    if (typeof value === 'bigint') return jsonldValue(value);
    if (Array.isArray(value)) return Promise.all(value.map(item => rdfInput(item, activeContext)));
    if (!isObject(value)) return value;
    if (own(value, '@context')) activeContext = await jsonld.processContext(activeContext, value['@context'], jsonldOptions(options));
    if (value['@type'] === '@json' && own(value, '@value')) return structuredClone(value);
    const result = Object.create(null);
    for (const [key, child] of Object.entries(value)) {
      const expandedKey = key.startsWith('@') ? key : activeContext.mappings.get(key)?.['@id'];
      if (key === '@context') result[key] = structuredClone(child);
      else if (expandedKey === '@value' && typeof child === 'bigint') {
        result[key] = String(child);
        if (!value['@type']) result['@type'] = 'http://www.w3.org/2001/XMLSchema#integer';
      }
      else if (expandedKey === '@id' && typeof child !== 'string') continue;
      else if (expandedKey === '@graph' && !isObject(child) && !Array.isArray(child)) result[key] = [];
      // RDFLib does not flatten arrays inside the graph's node collection.
      // Keep format validation responsible for their structural diagnostics.
      else if (expandedKey === '@graph' && Array.isArray(child))
        result[key] = await rdfInput(child.filter(item => !Array.isArray(item)), activeContext);
      else if (expandedKey === '@type' && (Array.isArray(child) ? child : [child]).some(item => typeof item !== 'string')) {
        const values = Array.isArray(child) ? child.flat(Infinity) : [child];
        result[key] = values.filter(item => typeof item === 'string');
        const malformedTypes = [];
        for (const item of values) {
          if (item === null || typeof item === 'string') continue;
          malformedTypes.push(isObject(item) ? await rdfInput(item, activeContext) : { '@value': typeof item === 'bigint' ? String(item) : item, '@type': emptyDatatype });
        }
        if (malformedTypes.length) result[RDF_TYPE] = [...(result[RDF_TYPE] ?? []), ...malformedTypes];
      }
      else if (key === RDF_TYPE && own(result, key)) result[key] = [...result[key], ...[await rdfInput(child, activeContext)].flat()];
      else result[key] = await rdfInput(child, activeContext);
    }
    // jsonld.js canonicalizes explicit doubles through Number, losing signed
    // zero and invalid lexical forms that RDFLib retains as distinct terms.
    if (typeof result['@value'] === 'string' && typeof result['@type'] === 'string') {
      const type = result['@type'];
      const colon = type.indexOf(':');
      const expanded = activeContext.mappings.get(type)?.['@id'] ??
        (colon >= 0 && activeContext.mappings.get(type.slice(0, colon))?.['@id']
          ? activeContext.mappings.get(type.slice(0, colon))['@id'] + type.slice(colon + 1) : type);
      if (expanded === XSD_DOUBLE) result['@type'] = lexicalDouble;
    }
    return result;
  }
  const expansionOptions = {...jsonldOptions(options), base};
  const expanded = await jsonld.expand(await rdfInput(document, initialContext), expansionOptions);
  // RDFLib keeps an untyped string distinct from explicit xsd:string. After
  // expansion, context-coerced types are explicit too, so both are preserved.
  function retainPlainStrings(value) {
    if (Array.isArray(value)) return value.forEach(retainPlainStrings);
    if (!isObject(value)) return;
    if (own(value, '@value')) {
      if (typeof value['@value'] === 'string' && !own(value, '@type') && !own(value, '@language'))
        value['@type'] = emptyDatatype;
      return;
    }
    Object.values(value).forEach(retainPlainStrings);
  }
  retainPlainStrings(expanded);
  const dataset = await jsonld.toRDF(expanded, {...expansionOptions, skipExpansion: true});
  for (const quad of dataset) {
    if (quad.object.termType === 'Literal' && quad.object.datatype.value === emptyDatatype) quad.object.datatype.value = '';
    if (quad.object.termType === 'Literal' && quad.object.datatype.value === lexicalDouble) quad.object.datatype.value = XSD_DOUBLE;
  }
  for (const quad of dataset) {
    if (quad.object.termType === 'Literal') quad.object.value = canonicalLiteral(quad.object);
  }
  return dataset;
}

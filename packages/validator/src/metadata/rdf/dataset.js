import {jsonldValue} from '../numbers.js';
import jsonld from 'jsonld';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const XSD_DOUBLE = 'http://www.w3.org/2001/XMLSchema#double';
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const jsonldOptions = options => ({ base: options.baseURL ?? 'file:///crate/ro-crate-metadata.json', ...(options.documentLoader ? { documentLoader: options.documentLoader } : {}) });

/** RDFLib tolerates non-string node IDs and null graphs before PyLD model parsing. */
export async function rdfDataset(document, options = {}, base = options.baseURL ?? 'file:///crate/ro-crate-metadata.json') {
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
    const result = {};
    for (const [key, child] of Object.entries(value)) {
      const expandedKey = key.startsWith('@') ? key : activeContext.mappings.get(key)?.['@id'];
      if (key === '@context') result[key] = structuredClone(child);
      else if (expandedKey === '@id' && typeof child !== 'string') continue;
      else if (expandedKey === '@graph' && child === null) result[key] = [];
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
  const dataset = await jsonld.toRDF(await rdfInput(document, initialContext), { ...jsonldOptions(options), base });
  for (const quad of dataset) {
    if (quad.object.termType === 'Literal' && quad.object.datatype.value === emptyDatatype) quad.object.datatype.value = '';
    if (quad.object.termType === 'Literal' && quad.object.datatype.value === lexicalDouble) quad.object.datatype.value = XSD_DOUBLE;
  }
  return dataset;
}

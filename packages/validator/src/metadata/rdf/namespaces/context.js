import {contextDocument} from '../../jsonld.js';
import {sourceKeys} from '../../json/ordered-members.js';
import {isPythonWordCharacter} from '../unicode-names.js';
import {createNamespaceFormatter} from './format.js';

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nodeKeys = new Set(['@graph', '@id', '@included', '@json', '@list', '@nest', '@none', '@reverse', '@set', '@type', '@value', '@language']);
const controls = new Set(['@vocab', '@version', '@import', '@protected', '@base', '@language', '@propagate']);
const entries = value => new Map(sourceKeys(value).map(key => [key, value[key]]));

/** Read only root namespace bindings; node/type/property contexts never bind prefixes. */
export async function rootNamespaceFormatter(document, options = {}, base = options.baseURL ?? 'file:///crate/ro-crate-metadata.json') {
  if (!object(document) || !document['@context']) return createNamespaceFormatter();
  const sources = [], references = new Set(), terms = new Map();
  let vocabulary = null, version = 1.1, currentBase = base;
  async function remote(reference, sourceBase) {
    const url = new URL(reference, sourceBase ?? base).href;
    // RDFLib records inclusions before its cache lookup, so repeated root
    // references are rejected even when separated by a context reset.
    if (references.has(url)) throw new TypeError('Recursive JSON-LD context inclusion');
    references.add(url);
    const loaded = await options.documentLoader(url);
    return {document: contextDocument(loaded.document), url: loaded.documentUrl ?? url};
  }
  async function prepare(source, sourceBase, sourceURL = null) {
    if (typeof source === 'string') {
      const loaded = await remote(source, sourceBase);
      return prepare(loaded.document, loaded.url, loaded.url);
    }
    if (Array.isArray(source)) {
      for (const item of source) await prepare(item, sourceBase, sourceURL);
    } else if (object(source) && own(source, '@context')) {
      await prepare(source['@context'], sourceBase, sourceURL);
    } else sources.push({source, sourceURL});
  }
  function sourceID(source, key) {
    let definition = source.get(key);
    if (definition === null || definition === undefined) return terms.get(key)?.id ?? null;
    if (object(definition)) definition = definition['@id'];
    return definition ?? null;
  }
  function expand(source, expression, previous = null, visited = new Set()) {
    if (expression === previous || nodeKeys.has(expression)) return expression;
    if (typeof expression !== 'string') throw new TypeError('Expected a namespace IRI string');
    if (visited.has(expression)) throw new TypeError('Cyclic namespace definition');
    visited.add(expression);
    const colon = expression.indexOf(':'), suffix = expression.slice(colon + 1);
    const prefix = colon >= 0 && !suffix.startsWith('//') ? expression.slice(0, colon) : null;
    let next;
    if (prefix) {
      let iri = sourceID(source, prefix);
      if (iri === null) {
        if (prefix + ':' === vocabulary) return expression;
        iri = terms.get(prefix)?.id ?? null;
      }
      if (iri !== null && typeof iri !== 'string') throw new TypeError('Expected a namespace IRI string');
      next = iri === null ? expression : iri + suffix;
    } else {
      const name = prefix === '' ? suffix : expression;
      next = sourceID(source, name) || name;
      if (typeof next !== 'string') throw new TypeError('Expected a namespace IRI string');
      if (!next.includes(':') && vocabulary) return vocabulary + next;
    }
    return next === expression ? expression : expand(source, next, expression, visited);
  }
  await prepare(document['@context'], base);
  for (const item of sources) {
    if (item.source === null) {terms.clear(); vocabulary = null; continue;}
    if (!object(item.source)) throw new TypeError('Expected a root context object');
    let source = entries(item.source);
    const imported = source.get('@import');
    if (imported) {
      const loaded = await remote(imported, currentBase);
      const context = loaded.document?.['@context'];
      if (!object(context)) throw new TypeError('Expected an imported context object');
      source = new Map([...entries(context), ...source]);
    }
    if (source.has('@vocab')) vocabulary = source.get('@vocab');
    if (source.has('@version')) version = source.get('@version');
    if (!item.sourceURL && !imported && source.has('@base')) currentBase = source.get('@base');
    for (const [name, definition] of source) {
      if (controls.has(name)) continue;
      // Context.add_term ignores unknown @keywords, using pinned Python alnum.
      const second = Array.from(name)[1];
      if (version >= 1.1 && name.startsWith('@') && second && second !== '_' &&
          isPythonWordCharacter(second) && !nodeKeys.has(name)) continue;
      let id = null, protectedTerm = Boolean(source.get('@protected'));
      if (object(definition)) {
        protectedTerm = own(definition, '@protected') ? Boolean(definition['@protected']) : protectedTerm;
        const reverse = definition['@reverse'];
        if (reverse || own(definition, '@id')) {
          const reference = reverse || definition['@id'];
          id = reference === '@type' ? 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' : expand(source, reference);
        } else if (name.includes(':')) id = expand(source, name);
        else if (vocabulary) id = vocabulary + name;
      } else if (typeof definition === 'string') {
        const initial = Array.from(definition)[1];
        if (version >= 1.1 && definition.startsWith('@') && initial && initial !== '_' &&
            isPythonWordCharacter(initial) && !nodeKeys.has(definition)) continue;
        id = expand(source, definition);
      }
      if (!(version >= 1.1 && terms.get(name)?.protected)) terms.set(name, {id, protected: protectedTerm});
    }
  }
  const bindings = vocabulary ? [[null, vocabulary]] : [];
  for (const [name, term] of terms) {
    if (typeof term.id === 'string' && /[#/:]$/.test(term.id)) bindings.push([name, term.id]);
  }
  // These are raw Context IDs. Resolving relative vocabulary against the base
  // would invent prefixes that the reference graph never binds.
  return createNamespaceFormatter(bindings, {ontologyDefaults: true});
}

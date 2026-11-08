import defaults from './defaults.json' with {type: 'json'};
import {isRDFNameCharacter, isRDFSplitStartCharacter} from '../unicode-names.js';

const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';
const extenders = new Set(['\u00b7', '\u0387', '-', '.', '_', '%', '(', ')']);

/** RDFLib splits by Unicode categories before consulting bound namespaces. */
function splitURI(uri) {
  if (uri.startsWith(XML_NAMESPACE)) return [XML_NAMESPACE, uri.split(XML_NAMESPACE)[1]];
  const characters = Array.from(uri), length = characters.length;
  for (let offset = 0; offset < length; offset += 1) {
    const character = characters[length - offset - 1];
    if (isRDFNameCharacter(character) || extenders.has(character)) continue;
    // Preserve Python's negative-to-positive index scan, including its wrap
    // when a trailing delimiter has no following name-start character.
    for (let index = -1 - offset; index < length; index += 1) {
      const boundary = index < 0 ? length + index : index;
      if (!isRDFSplitStartCharacter(characters[boundary]) && characters[boundary] !== '_') continue;
      if (!boundary) break;
      return [characters.slice(0, boundary).join(''), characters.slice(boundary).join('')];
    }
    break;
  }
  throw new Error('URI has no namespace/name split');
}

/** A private equivalent of Graph's namespace binding and URIRef label rules. */
export function createNamespaceFormatter(bindings = [], {ontologyDefaults = false} = {}) {
  const namespaces = new Map(), prefixes = new Map(), history = new Set(), cache = new Map();
  function storeBind(prefix, namespace) {
    const boundNamespace = namespaces.get(prefix);
    const boundPrefix = prefixes.get(namespace) ?? prefixes.get(boundNamespace);
    if (boundPrefix !== undefined) namespaces.delete(boundPrefix);
    if (boundNamespace !== undefined) prefixes.delete(boundNamespace);
    prefixes.set(namespace, prefix);
    namespaces.set(prefix, namespace);
  }
  function bind(prefix, namespace) {
    prefix ??= '';
    if (prefix.includes(' ')) throw new Error('Prefixes may not contain spaces.');
    const boundNamespace = namespaces.get(prefix);
    if (boundNamespace && boundNamespace !== namespace) {
      const stem = prefix || 'default';
      let suffix = 1;
      while (namespaces.get(stem + suffix)) {
        if (namespaces.get(stem + suffix) === namespace) return;
        suffix += 1;
      }
      storeBind(stem + suffix, namespace);
    } else if (prefixes.get(namespace) !== prefix) storeBind(prefix, namespace);
    history.add(namespace);
  }
  for (const [prefix, namespace] of [...defaults, ...bindings]) bind(prefix, namespace);
  if (ontologyDefaults) {
    // Inoculation tests the prefix snapshot once, before restoring missing
    // ontology bindings; later restorations may displace a context alias.
    const present = new Set(namespaces.keys());
    for (const [prefix, namespace] of defaults) if (!present.has(prefix)) bind(prefix, namespace);
  }
  return {
    bindings: () => [...namespaces],
    format(uri) {
      // URIRef.n3 rejects these characters; pySHACL then uses the raw text.
      if (/[<>" {}|\\^`]/.test(uri)) return uri;
      let namespace, name;
      try {[namespace, name] = splitURI(uri);} catch {return '<' + uri + '>';}
      history.add(namespace);
      if (!prefixes.has(namespace)) return '<' + uri + '>';
      if (!cache.has(uri)) {
        for (const candidate of history) {
          if (candidate.length > namespace.length && candidate.startsWith(namespace) && uri.startsWith(candidate)) {
            namespace = candidate;
            name = uri.slice(namespace.length);
          }
        }
        if (!prefixes.has(namespace)) {
          let suffix = 1;
          while (namespaces.get('ns' + suffix)) suffix += 1;
          bind('ns' + suffix, namespace);
        }
        cache.set(uri, prefixes.get(namespace) + ':' + name);
      }
      return cache.get(uri);
    },
  };
}

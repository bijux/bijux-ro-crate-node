import url from 'jsonld/lib/url.js';
const scheme = value => /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value);
const absolute = value => scheme(value) || value.startsWith('/');
const iriText = value => value.replace(/^[\x00-\x20]+/, '').replace(/[\t\r\n]/g, '');
const components = value => /^(.*?)(\?[^#]*)?(#.*)?$/s.exec(value).slice(1);

// Resolve relative path recipes without inventing a physical parent or
// clamping leading parent segments at an arbitrary virtual filesystem origin.
export function relativeRecipe(base, value) {
  if (typeof value === 'string') value = iriText(value);
  if (typeof base === 'string') base = iriText(base);
  if (value === null || absolute(value)) return value;
  if (base === null || scheme(base)) return base;
  if (base.startsWith('/')) return url.prependBase(base, value);
  const [path, query, fragment] = components(value);
  const [previous, previousQuery] = components(base);
  if (!path) return previous + (query && query !== '?' ? query : previousQuery ?? '') + (fragment ?? '');
  const merged = previous.slice(0, previous.lastIndexOf('/') + 1) + path;
  const parts = [];
  for (const segment of merged.split('/')) {
    if (segment === '.' || !segment) continue;
    if (segment === '..') {
      if (parts.length && parts.at(-1) !== '..') parts.pop();
      else parts.push('..');
    } else parts.push(segment);
  }
  const trailing = merged.endsWith('/') || /(?:^|\/)\.{1,2}$/.test(merged);
  const normalized = parts.length ? parts.join('/') + (trailing ? '/' : '') : trailing ? './' : '';
  return normalized + (query === '?' ? '' : query ?? '') + (fragment ?? '');
}

/** Track only physical-dependent identities that survive into consumed RDF. */
export function physicalBaseGuard(base, rootURL) {
  const initial = base === rootURL ? './' : base.startsWith(rootURL) ? base.slice(rootURL.length) : base;
  const token = [...crypto.getRandomValues(new Uint8Array(16))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const markers = new Map();
  return {
    base(previous, value) {
      if (value === null) return {path: '', unbased: true};
      value = iriText(value);
      if (scheme(value)) return {path: value, unbased: false};
      if (value.startsWith('/')) return {path: value, unbased: previous?.unbased ?? false};
      const state = previous ?? {path: initial, unbased: false};
      return {path: relativeRecipe(state.path, value), unbased: state.unbased};
    },
    node(value, recipe, contextBase, relativeIRIs = false) {
      if (typeof recipe !== 'string') return value;
      recipe = iriText(recipe);
      if (recipe.startsWith('_:') || scheme(recipe) || recipe.startsWith('/') && !contextBase?.unbased) return value;
      if (contextBase?.unbased) {
        if (relativeIRIs) return value;
        return relativeRecipe(contextBase.path, relativeRecipe(contextBase.path, recipe));
      }
      const resolved = relativeRecipe(contextBase?.path ?? initial, recipe);
      const path = resolved === null ? '' : components(resolved)[0];
      if (path !== '..' && !path.startsWith('../'))
        return resolved !== null && !absolute(resolved) ? url.prependBase(rootURL, resolved) : value;
      if (!markers.has(value)) markers.set(value, rootURL + '#physical-parent-' + token + '-' + markers.size);
      return markers.get(value);
    },
    assertConsumed(dataset) {
      if (!markers.size) return;
      const values = new Set(markers.values());
      for (const quad of dataset) {
        if (quad.graph.termType !== 'DefaultGraph') continue;
        if ([quad.subject, quad.predicate, quad.object].some(term => term.termType === 'NamedNode' && values.has(term.value)))
          throw new Error('RDF identifiers depend on a physical parent directory outside the selected crate.');
      }
    },
  };
}

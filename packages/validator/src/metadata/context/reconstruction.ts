import {jsonld, jsonldOptions} from '../jsonld.js';
import {STANDARD_CONTEXT} from '../models/registry.js';

interface Mapping {
  '@id': string | null;
  '@type'?: string | null;
  '@container'?: string[] | null;
  protected?: boolean;
  reverse?: boolean;
  _prefix?: boolean;
}
interface ActiveContext {mappings: Map<string, Mapping | null>}
interface Issue {message: string; severity: number; location_description: string | null}

const own = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);
const unsupportedTermKeys = ['@context', '@language', '@direction', '@index', '@nest'];

function issue(issues: Issue[], message: string, location_description = 'At @context') {
  issues.push({message, severity: 40, location_description});
}

function compactIRI(iri: string, prefixes: Map<string, string>) {
  const candidates = [...prefixes].sort(([left, a], [right, b]) =>
    b.length - a.length || (left < right ? -1 : left > right ? 1 : 0));
  for (const [name, namespace] of candidates) {
    if (!name || name === '_' || name.startsWith('@') || /[:/]/.test(name) || !iri.startsWith(namespace)) continue;
    const suffix = iri.slice(namespace.length), compact = `${name}:${suffix}`;
    if (!suffix.startsWith('//') && compact.length < iri.length) return compact;
  }
  return iri;
}

/** Reconstruct only context semantics represented by the Python metadata parser. */
export async function reconstructContext(context: unknown, issues: Issue[], options: Parameters<typeof jsonldOptions>[0] = {}) {
  const initialErrors = issues.filter(item => item.severity >= 40).length;
  const initial = await jsonld.processContext(null, null, jsonldOptions(options));
  // The pinned processor returns its active mapping table after processing.
  const active = await jsonld.processContext(initial, context, jsonldOptions(options)) as ActiveContext;
  const parsed: Record<string, unknown> = Object.create(null);
  for (const keyword of ['@base', '@vocab', '@language', '@direction', 'previousContext']) {
    if (own(active, keyword)) issue(issues, `Unsupported context default: ${keyword}`);
  }
  if (issues.filter(item => item.severity >= 40).length > initialErrors) return parsed;

  const standard = await jsonld.processContext(initial, STANDARD_CONTEXT, jsonldOptions(options)) as ActiveContext;
  const prefixes = new Map<string, string>(), terms: [string, Mapping & {'@id': string}][] = [], typeTerms: [string, boolean][] = [];
  for (const [key, mapping] of active.mappings) {
    if (!mapping || mapping['@id'] == null || mapping.protected ||
        unsupportedTermKeys.some(keyword => own(mapping, keyword))) {
      issue(issues, `Unsupported context semantics for term: ${key}`);
      continue;
    }
    const expected = standard.mappings.get(key);
    // Namespace prefixes and keyword mappings are not standard BIA properties.
    if (expected && !expected._prefix && !expected['@id']!.startsWith('@') &&
        (expected['@id'] !== mapping['@id'] || Boolean(expected.reverse) !== Boolean(mapping.reverse))) {
      issue(issues, `Term has been remapped in context: ${key} must be mapped to ${expected['@id']}`, `At ${key}`);
      continue;
    }
    if (mapping._prefix) {
      if (mapping['@type'] != null || mapping['@container']?.length) {
        issue(issues, `Unsupported context value semantics for prefix: ${key}`);
      } else prefixes.set(key, mapping['@id']);
    } else if (mapping['@id'] === '@type') {
      typeTerms.push([key, mapping['@container']?.includes('@set') === true]);
    } else terms.push([key, mapping as Mapping & {'@id': string}]);
  }
  if (issues.filter(item => item.severity >= 40).length > initialErrors) return parsed;

  for (const [key, iri] of prefixes) parsed[key] = /[/#]$/.test(iri) ? iri : {'@id': iri, '@prefix': true};
  for (const [key, mapping] of terms) {
    const value: Record<string, string | string[]> = {[mapping.reverse ? '@reverse' : '@id']: compactIRI(mapping['@id'], prefixes)};
    if (mapping['@type']) value['@type'] = mapping['@type'];
    if (mapping['@container']?.length) value['@container'] = [...new Set(mapping['@container'])].sort();
    parsed[key] = value;
  }
  for (const [key, forceSet] of typeTerms) {
    if (key === '@type' && !forceSet) continue;
    parsed[key] = {...(key !== '@type' ? {'@id': '@type'} : {}), ...(forceSet ? {'@container': '@set'} : {})};
  }
  return Object.assign(Object.create(null), Object.fromEntries(Object.entries(parsed).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
}

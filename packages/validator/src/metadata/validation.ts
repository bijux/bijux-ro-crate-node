import type {ValidationIssue} from '@bijux/ro-crate-core';
import type {ParsedMetadata} from './types.js';
import type {ModelIssue} from './models/issues.js';
import {jsonldValue} from './json/jsonld-values.js';
import {jsonld, jsonldOptions} from './jsonld.js';
import {MODEL_REGISTRY} from './models/registry.js';
import {validateModel} from './models/validation.js';
import {reconstructContext} from './context/reconstruction.js';
const own = (object: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(object, key);
function issue(issues: ValidationIssue[], message: string, location_description: string | null = null, severity: ValidationIssue['severity'] = 40) {
  issues.push({ message, severity, location_description });
}

function formatError(error: ModelIssue) {
  if (error.type === 'missing') return `Missing required field: ${error.loc[0]}`;
  if (!error.loc.length) return error.msg;
  if (error.loc.length === 1) return `At ${error.loc[0]}: ${error.msg}`;
  return `At ${error.loc[0]}, index: ${error.loc[1]}: ${error.msg}`;
}
export async function validateMetadata(document: unknown, issues: ValidationIssue[], options: Parameters<typeof jsonldOptions>[0] = {}): Promise<ParsedMetadata> {
  const entities = new Map<string, Record<string, unknown> & {'@id': string}>();
  const modelTypes = new Map<string, string>();
  const initialErrors = issues.filter(item => item.severity >= 40).length;
  const parsedContext = await reconstructContext((document as {'@context'?: unknown})['@context'], issues, options);
  if (issues.filter(item => item.severity >= 40).length > initialErrors) return { entities, modelTypes, context: parsedContext };
  for (const entity of (document as {'@graph': Record<string, unknown>[]})['@graph']) {
    const expanded = await jsonld.expand({ '@context': parsedContext, '@graph': [jsonldValue(entity)] }, { ...jsonldOptions(options), base: null });
    // PyLD's parser indexes the first expanded node. An empty expansion is an
    // interrupted parse, rather than a completed unknown-model rejection.
    if (!expanded.length) throw new Error('Metadata entity did not expand to a JSON-LD node');
    const expandedEntity = expanded[0] as {'@type'?: string[]; '@id'?: string};
    const types = [...new Set(expandedEntity['@type'] ?? [])];
    const matches = types.filter(type => own(MODEL_REGISTRY, type));
    const expandedID = expandedEntity['@id'];
    if (matches.length !== 1) {
      issue(issues, `@type of object does not contain exactly 1 BIA classes. @type contains: ${types.join(', ')}, matching ${matches.length} BIA classes.`, `At ro-crate object with @id: ${expandedID ?? 'None'}`);
      continue;
    }
    const validated = validateModel(entity, matches[0]);
    if (validated.errors.length) {
      issue(issues, validated.errors.map(formatError).join('\n'), `At ro-crate object with @id: ${expandedID ?? 'Unknown ID'}`);
      continue;
    }
    // Every registry model requires or supplies a string @id.
    const id = validated.entity['@id'] as string;
    if (entities.has(id)) issue(issues, `Found more than one object with @id ${id}.`, `At ro-crate object with @id: ${id}`);
    entities.set(id, validated.entity as Record<string, unknown> & {'@id': string});
    modelTypes.set(id, validated.model);
  }
  return { entities, modelTypes, context: parsedContext };
}

import {jsonldValue} from './json/jsonld-values.js';
import {jsonld, jsonldOptions} from './jsonld.js';
import {MODEL_REGISTRY} from './models/registry.js';
import {validateModel} from './models/validation.js';
import {reconstructContext} from './context/reconstruction.js';
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
function issue(issues, message, location_description = null, severity = 40) {
  issues.push({ message, severity, location_description });
}

function formatError(error) {
  if (error.type === 'missing') return `Missing required field: ${error.loc[0]}`;
  if (!error.loc.length) return error.msg;
  if (error.loc.length === 1) return `At ${error.loc[0]}: ${error.msg}`;
  return `At ${error.loc[0]}, index: ${error.loc[1]}: ${error.msg}`;
}
export async function validateMetadata(document, issues, options = {}) {
  const entities = new Map();
  const modelTypes = new Map();
  const initialErrors = issues.filter(item => item.severity >= 40).length;
  const parsedContext = await reconstructContext(document['@context'], issues, options);
  if (issues.filter(item => item.severity >= 40).length > initialErrors) return { entities, modelTypes, context: parsedContext };
  for (const entity of document['@graph']) {
    const expanded = await jsonld.expand({ '@context': parsedContext, '@graph': [jsonldValue(entity)] }, { ...jsonldOptions(options), base: null });
    // PyLD's parser indexes the first expanded node. An empty expansion is an
    // interrupted parse, rather than a completed unknown-model rejection.
    if (!expanded.length) throw new Error('Metadata entity did not expand to a JSON-LD node');
    const expandedEntity = expanded[0];
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
    const id = validated.entity['@id'];
    if (entities.has(id)) issue(issues, `Found more than one object with @id ${id}.`, `At ro-crate object with @id: ${id}`);
    entities.set(id, validated.entity);
    modelTypes.set(id, validated.model);
  }
  return { entities, modelTypes, context: parsedContext };
}

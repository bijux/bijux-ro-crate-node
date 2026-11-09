import {pythonStringRepr} from '../../diagnostics/python-strings.js';
import {MODEL_REGISTRY} from './registry.js';
import {parseInteger} from './integers.js';
import {parseDate} from './dates.js';
import {parseURL} from './urls.js';
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
// RDFLib's URIRef.n3 rejects these characters but accepts relative IRIs and malformed percent escapes.
function validateIRI(value) {
  return value.startsWith('_:') || !/[<>" {}|\\^`]/.test(value);
}
function pythonRepr(value) {
  if (typeof value === 'string') return pythonStringRepr(value);
  if (Array.isArray(value)) return `[${value.map(pythonRepr).join(', ')}]`;
  if (value === null) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  return String(value);
}
function addError(errors, loc, msg, type = 'value_error') { errors.push({ loc, msg, type }); }


function validateField(value, schema, loc, errors, definitions) {
  if (schema.$ref) {
    if (!isObject(value)) {
      addError(errors, loc, 'Input should be a valid dictionary or instance of ObjectReference', 'model_type');
      return value;
    }
    const nested = {};
    if (!own(value, '@id')) addError(errors, [...loc, '@id'], 'Field required', 'missing');
    else nested['@id'] = validateField(value['@id'], { type: 'string' }, [...loc, '@id'], errors, definitions);
    if (typeof nested['@id'] === 'string' && !validateIRI(nested['@id'])) addError(errors, [...loc, '@id'], `Value error, "${nested['@id']}" is not a valid IRI`);
    return nested;
  }
  if (schema.anyOf) {
    const nullable = schema.anyOf.find(branch => branch.type === 'null');
    if (nullable) return value === null ? null : validateField(value, schema.anyOf.find(branch => branch.type !== 'null'), loc, errors, definitions);
    // The only non-null union in this registry is str | list[str]. Pydantic preserves union branch locations.
    const branches = schema.anyOf.map(branch => {
      const branchErrors = [];
      const label = branch.type === 'array' ? 'list[str]' : 'str';
      const parsed = validateField(value, branch, [...loc, label], branchErrors, definitions);
      return { parsed, errors: branchErrors };
    });
    const successful = branches.find(branch => branch.errors.length === 0);
    if (successful) return successful.parsed;
    errors.push(...branches.flatMap(branch => branch.errors));
    return value;
  }
  if (schema.format === 'date') return parseDate(value, loc, errors);
  if (schema.format === 'uri') return parseURL(value, loc, errors);
  if (schema.type === 'string') {
    if (typeof value !== 'string') addError(errors, loc, 'Input should be a valid string', 'string_type');
    return value;
  }
  if (schema.type === 'integer') return parseInteger(value, loc, errors);
  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      addError(errors, loc, 'Input should be a valid list', 'list_type');
      return value;
    }
    const before = errors.length;
    const parsed = value.map((item, index) => validateField(item, schema.items, [...loc, index], errors, definitions));
    if (errors.length === before && value.length < (schema.minItems ?? 0)) addError(errors, loc, `List should have at least ${schema.minItems} item after validation, not ${value.length}`, 'too_short');
    return parsed;
  }
  if (schema.type === 'object') {
    if (!isObject(value)) addError(errors, loc, 'Input should be a valid dictionary', 'dict_type');
    return value;
  }
  throw new Error(`Unsupported generated model field schema ${JSON.stringify(schema)}`);
}

/** Validate and normalize one registered BIA model without changing the supplied object. */
export function validateModel(entity, modelURI) {
  const descriptor = MODEL_REGISTRY[modelURI];
  if (!descriptor) throw new Error(`Unknown BIA model ${modelURI}`);
  const errors = [];
  const normalized = structuredClone(entity);
  for (const [key, schema] of Object.entries(descriptor.schema.properties)) {
    if (!own(entity, key)) {
      if (descriptor.schema.required?.includes(key)) addError(errors, [key], 'Field required', 'missing');
      else normalized[key] = structuredClone(descriptor.defaults[key]);
      continue;
    }
    const previousErrorCount = errors.length;
    normalized[key] = validateField(entity[key], schema, [key], errors, descriptor.schema.$defs);
    if (errors.length !== previousErrorCount) continue;
    if (key === '@id') {
      if (!validateIRI(normalized[key])) addError(errors, [key], `Value error, "${normalized[key]}" is not a valid IRI`);
      else if (descriptor.name === 'Study' && normalized[key] !== './') addError(errors, [key], 'Value error, Study id should be root ro-crate entity.');
    }
    if (key === '@type') {
      const short = modelURI.replace('http://www.w3.org/ns/csvw#', 'csvw:').replace('http://bia/', 'bia:').replace('http://schema.org/', '').replace('https://schema.org/', '');
      const types = Array.isArray(normalized[key]) ? normalized[key] : [normalized[key]];
      if (!types.includes(modelURI) && !types.includes(short)) addError(errors, [key], `Value error, Expected ${modelURI}, or ${short} in types, found: ${typeof normalized[key] === 'string' ? normalized[key] : pythonRepr(normalized[key])}`);
    }
  }
  return { entity: normalized, errors, model: descriptor.name };
}

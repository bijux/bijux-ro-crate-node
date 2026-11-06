import {MODEL_REGISTRY} from './registry.js';
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
// RDFLib's URIRef.n3 rejects these characters but accepts relative IRIs and malformed percent escapes.
function validateIRI(value) {
  return value.startsWith('_:') || !/[<>" {}|\\^`]/.test(value);
}
function pythonRepr(value) {
  if (typeof value === 'string') return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
  if (Array.isArray(value)) return `[${value.map(pythonRepr).join(', ')}]`;
  if (value === null) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  return String(value);
}
function addError(errors, loc, msg, type = 'value_error') { errors.push({ loc, msg, type }); }

function parseDate(value, loc, errors) {
  const invalid = detail => addError(errors, loc, `Input should be a valid date or datetime, ${detail}`, 'date_from_datetime_parsing');
  let dateValue = value;
  if (typeof value === 'string' && /^[+-]?[0-9]+(?:\.[0-9]+)?$/.test(value)) dateValue = Number(value);
  if (typeof dateValue === 'number' && Number.isFinite(dateValue)) {
    const seconds = Math.abs(dateValue) > 2e10 ? dateValue / 1000 : dateValue;
    const wholeSeconds = Math.floor(seconds);
    // Preserve the signed-fraction behavior in poetry.lock's pydantic-core 2.41.5.
    const microseconds = Math.round(Math.abs(seconds % 1) * 1000000);
    const normalizedSeconds = wholeSeconds + (microseconds === 1000000 ? 1 : 0);
    const milliseconds = normalizedSeconds * 1000;
    if (normalizedSeconds % 86400 || microseconds % 1000000) {
      addError(errors, loc, 'Datetimes provided to dates should have zero time - e.g. be exact dates', 'date_from_datetime_inexact');
      return value;
    }
    const date = new Date(milliseconds);
    if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) {
      invalid(dateValue < 0 ? 'dates before 0000 are not supported as unix timestamps' : 'dates after 9999 are not supported as unix timestamps');
      return value;
    }
    return date.toISOString().slice(0, 10);
  }
  if (typeof value !== 'string') {
    addError(errors, loc, 'Input should be a valid date', 'date_type');
    return value;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})([\s\S]*)$/.exec(value);
  if (!match) {
    if (value.length < 10) invalid('input is too short');
    else if (!/^\d{4}/.test(value)) invalid('invalid character in year');
    else if (value[4] !== '-') invalid('invalid date separator, expected `-`');
    else if (!/^\d{2}$/.test(value.slice(5, 7))) invalid('invalid character in month');
    else if (value[7] !== '-') invalid('invalid date separator, expected `-`');
    else invalid('invalid character in day');
    return value;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const maxDay = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (month < 1 || month > 12) invalid('month value is outside expected range of 1-12');
  else if (day < 1 || day > maxDay) invalid('day value is outside expected range');
  else if (year < 1) addError(errors, loc, 'Input should be a valid date in the format YYYY-MM-DD, year 0 is out of range', 'date_parsing');
  else if (match[4]) {
    const time = /^[Tt _](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?([Zz]|[+-](\d{2}):?(\d{2}))?$/.exec(match[4]);
    if (!/^[Tt _]/.test(match[4])) invalid('invalid datetime separator, expected `T`, `t`, `_` or space');
    else if (!time && /[.,]$/.test(match[4])) invalid('second fraction digits missing after `.`');
    else if (!time && !/^[Tt _]\d{2}/.test(match[4])) invalid('invalid character in hour');
    else if (!time && /[+-]\d{2}$/.test(match[4])) invalid('invalid timezone minute');
    else if (!time) invalid('unexpected extra characters at the end of the input');
    else if (Number(time[1]) > 23) invalid('hour value is outside expected range of 0-23');
    else if (Number(time[2]) > 59) invalid('minute value is outside expected range of 0-59');
    else if (Number(time[3] || 0) > 59) invalid('second value is outside expected range of 0-59');
    else if (Number(time[7] || 0) > 59) invalid('timezone minute value is outside expected range of 0-59');
    else if (Number(time[6] || 0) > 23) invalid('timezone offset must be less than 24 hours');
    else if (time.slice(1, 4).some(part => Number(part || 0) !== 0) || Number((time[4] || '').slice(0, 6)) !== 0) addError(errors, loc, 'Datetimes provided to dates should have zero time - e.g. be exact dates', 'date_from_datetime_inexact');
  }
  return value.slice(0, 10);
}

function parseURL(value, loc, errors) {
  if (typeof value !== 'string') {
    addError(errors, loc, 'URL input should be a string or URL', 'url_type');
    return value;
  }
  try { return new URL(value).href; }
  catch {
    let detail = 'relative URL without a base';
    const trimmed = value.trim();
    if (!trimmed) detail = 'input is empty';
    else if (/^https?:\/*(?:[?#].*)?$/.test(trimmed)) detail = 'empty host';
    else if (/^[a-z][a-z\d+.-]*:/i.test(trimmed)) {
      if (/\[/.test(trimmed)) detail = 'invalid IPv6 address';
      else if (/^https?:\/\/[^/]+:[^/]*\/?$/.test(trimmed)) detail = 'invalid port number';
      else if (/^https?:\/\/(?:[0-9]+\.)+[0-9]+/.test(trimmed)) detail = 'invalid IPv4 address';
      else detail = 'invalid international domain name';
    }
    addError(errors, loc, `Input should be a valid URL, ${detail}`, 'url_parsing');
    return value;
  }
}

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
  if (schema.type === 'integer') {
    if (typeof value === 'boolean') return Number(value);
    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        if (!Number.isSafeInteger(value)) throw new Error('Integer precision exceeds the browser validator safe range');
        return value;
      }
      addError(errors, loc, Number.isFinite(value) ? 'Input should be a valid integer, got a number with a fractional part' : 'Input should be a finite number', Number.isFinite(value) ? 'int_from_float' : 'finite_number');
    } else if (typeof value === 'string') {
      const normalized = value.trim();
      if (/^[+-]?\d(?:_?\d)*(?:\.0+)?$/.test(normalized)) {
        const parsed = Number(normalized.replaceAll('_', ''));
        if (!Number.isSafeInteger(parsed)) throw new Error('Integer precision exceeds the browser validator safe range');
        return parsed;
      }
      addError(errors, loc, 'Input should be a valid integer, unable to parse string as an integer', 'int_parsing');
    } else addError(errors, loc, 'Input should be a valid integer', 'int_type');
    return value;
  }
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

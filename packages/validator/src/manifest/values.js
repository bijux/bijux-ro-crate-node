import {retainNumericAlternative, numericAlternative} from './numeric-identity.js';

// These are pandas' default read_csv missing-value spellings, including quoted cells.
const NA_VALUES = new Set([
  '', '#N/A', '#N/A N/A', '#NA', '-1.#IND', '-1.#QNAN', '-NaN', '-nan',
  '1.#IND', '1.#QNAN', '<NA>', 'N/A', 'NA', 'NULL', 'NaN', 'None',
  'n/a', 'nan', 'null',
]);

// pandas' default parser accumulates at most 17 digits, including leading zeros.
// Applying the decimal and explicit exponent together preserves its rounding.
function pandasFloat(value) {
  const match = value.trim().match(/^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
  if (!match) return [Number(value), Number(value)];
  const integer = match[2];
  const fraction = match[3] ?? '';
  const digits = (integer + fraction).slice(0, 17);
  let number = 0, fused = 0;
  for (const character of digits) {
    const digit = Number(character);
    number = number * 10 + digit;
    // An FMA rounds the exact integer product and sum only once. The first
    // safe digits need no BigInt conversion; at most two retained digits do.
    fused = fused <= 900719925474099 ? fused * 10 + digit : Number(BigInt(fused) * 10n + BigInt(digit));
  }
  const exponent = integer.length - digits.length + Number(match[4] ?? 0);
  return [scaleFloat(number, exponent, match[1] === '-'), scaleFloat(fused, exponent, match[1] === '-')];
}

// precise_xstrtod applies the sign before scaling. Its extreme-exponent
// branches produce positive zero, while ordinary division retains -0.
function scaleFloat(number, exponent, negative) {
  if (negative) number = -number;
  if (exponent > 308) number = number === 0 ? 0 : number < 0 ? -Infinity : Infinity;
  else if (exponent > 0) number *= Number(`1e${exponent}`);
  else if (exponent < -308) {
    if (exponent < -616) number = 0;
    else {
      number /= Number(`1e${-exponent - 308}`);
      number /= 1e308;
    }
  } else if (exponent < 0) number /= Number(`1e${-exponent}`);
  return number;
}

export function inferColumn(rawValues) {
  if (!rawValues.length) return {values: [], floating: false, kind: 'object'};
  const values = rawValues.map(value => NA_VALUES.has(value) ? null : value);
  const present = values.filter(value => value !== null);
  const signed = integerColumn(values, false);
  if (!signed.error) return integerResult(signed.values, values, false);
  if (signed.error === 'overflow') {
    const unsigned = integerColumn(values, true);
    if (!unsigned.error) return integerResult(unsigned.values, values, true);
    if (unsigned.error === 'conflict') return {values: rawValues, floating: false, kind: 'string'};
    if (unsigned.error === 'overflow') {
      // Overflow reaches Python's arbitrary-precision fallback. A prior
      // non-integer instead reaches floating inference, so row order matters.
      const parsed = values.map(value => pythonInteger(value));
      if (parsed.every(value => value !== undefined))
        return {values: parsed, floating: false, kind: 'object'};
      return {values: rawValues, floating: false, kind: 'string'};
    }
  }
  const numeric = present.every(value =>
    /^[ \t\n\r\v\f]*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?[ \t\n\r\v\f]*$/i.test(value) ||
    /^[+-]?inf(?:inity)?$/i.test(value));
  if (numeric) {
    const numbers = [], alternate = [];
    for (const value of values) {
      const pair = value === null ? [null, null] : /inf/i.test(value)
        ? Array(2).fill(/^\s*-/.test(value) ? -Infinity : Infinity) : pandasFloat(value);
      numbers.push(pair[0]);
      alternate.push(pair[1]);
    }
    return retainNumericAlternative({floating: true, kind: 'float', values: numbers}, alternate);
  }
  if (present.every(value => /^(true|false)$/i.test(value))) {
    return {
      floating: false,
      kind: present.length === values.length ? 'boolean' : 'object',
      values: values.map(value => value === null ? null : value.toLowerCase() === 'true'),
    };
  }
  return { values, floating: false, kind: 'string' };
}

// Match the C parser's first conversion failure, including lexical negative
// zero and overflow before trailing-whitespace validation.
function integerColumn(values, unsigned) {
  const parsed = [];
  let negative = false, large = false, missing = false;
  for (const value of values) {
    if (value === null) {missing = true; parsed.push(null); continue;}
    const word = value.replace(/^[ \t\n\r\v\f]+/, '');
    if (unsigned && word.startsWith('-')) {negative = true; parsed.push(0n); continue;}
    const match = /^([+-]?)([0-9]+)([\s\S]*)$/.exec(word);
    if (!match) return {error: 'invalid'};
    const digits = match[2].replace(/^0+/, '') || '0';
    const limit = unsigned ? 18446744073709551615n : match[1] === '-' ? 9223372036854775808n : 9223372036854775807n;
    if (digits.length > 20 || BigInt(digits) > limit)
      return {error: match[3] ? 'invalid' : 'overflow'};
    if (/[^ \t\n\r\v\f]/.test(match[3])) return {error: 'invalid'};
    const number = BigInt(digits) * (match[1] === '-' ? -1n : 1n);
    if (number > 9223372036854775807n) large = true;
    parsed.push(number);
  }
  if (unsigned && large && (negative || missing)) return {error: 'conflict'};
  if (unsigned && negative) return {error: 'overflow'};
  return {values: parsed};
}

function integerResult(parsed, values, unsigned) {
  const floating = values.some(value => value === null);
  return {floating, kind: floating ? 'float' : unsigned ? 'unsigned' : 'integer',
    values: parsed.map(value => value === null ? null : floating || Number.isSafeInteger(Number(value)) ? Number(value) : value)};
}

function pythonInteger(value) {
  if (value === null) return null;
  const word = value.replace(/^[ \t\n\r\v\f]+|[ \t\n\r\v\f]+$/g, '');
  if (!/^[+-]?[0-9](?:_?[0-9])*$/.test(word) || word.replace(/[^0-9]/g, '').length > 4300) return undefined;
  return BigInt(word.replaceAll('_', ''));
}

export function inferChunks(values, width) {
  // CParser's DEFAULT_BUFFER_HEURISTIC is 2**20, divided by table width.
  let chunkSize = 1;
  while (chunkSize * 2 < 1048576 / width) chunkSize *= 2;
  if (values.length <= chunkSize) return inferColumn(values);
  const chunks = [];
  for (let start = 0; start < values.length; start += chunkSize) {
    chunks.push(inferColumn(values.slice(start, start + chunkSize)));
  }
  const kinds = new Set(chunks.map(chunk => chunk.kind));
  const numeric = [...kinds].every(kind => ['integer', 'unsigned', 'float'].includes(kind));
  const floating = numeric && (kinds.has('float') || kinds.size > 1);
  const combined = chunks.flatMap(chunk => chunk.values);
  const alternatives = chunks.flatMap(chunk => numericAlternative(chunk) ?? chunk.values);
  if (floating) return retainNumericAlternative({ values: combined.map(value => value === null ? null : Number(value)), floating: true, kind: 'float' }, alternatives.map(value => value === null ? null : Number(value)));
  const floatingIndices = new Set();
  let offset = 0;
  for (const chunk of chunks) {
    if (chunk.floating) {
      for (let index = 0; index < chunk.values.length; index += 1) floatingIndices.add(offset + index);
    }
    offset += chunk.values.length;
  }
  return retainNumericAlternative({ values: combined, floating: false, floatingIndices, kind: kinds.size === 1 ? chunks[0].kind : 'object' }, alternatives);
}

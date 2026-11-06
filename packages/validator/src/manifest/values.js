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
  if (!match) return Number(value);
  const integer = match[2];
  const fraction = match[3] ?? '';
  const digits = (integer + fraction).slice(0, 17);
  let number = 0;
  for (const digit of digits) number = number * 10 + Number(digit);
  const exponent = integer.length - digits.length + Number(match[4] ?? 0);
  if (!number) return match[1] === '-' ? -0 : 0;
  if (exponent > 616) number = Infinity;
  else if (exponent > 308) {
    number *= Number(`1e${exponent - 308}`);
    number *= 1e308;
  } else if (exponent > 0) number *= Number(`1e${exponent}`);
  else if (exponent < -308) {
    number /= Number(`1e${-exponent - 308}`);
    number /= 1e308;
  } else if (exponent < 0) number /= Number(`1e${-exponent}`);
  return match[1] === '-' ? -number : number;
}

export function inferColumn(rawValues) {
  const values = rawValues.map(value => NA_VALUES.has(value) ? null : value);
  const present = values.filter(value => value !== null);
  const integers = present.every(value => /^[ \t\n\r\v\f]*[+-]?\d+[ \t\n\r\v\f]*$/.test(value));
  if (integers && present.length) {
    const parsed = present.map(value => BigInt(value.trim()));
    const hasNegative = parsed.some(value => value < 0n);
    const hasUnsigned = parsed.some(value => value > 9223372036854775807n && value <= 18446744073709551615n);
    const maximum = hasNegative ? 9223372036854775807n : 18446744073709551615n;
    const fits = parsed.every(value => value >= -9223372036854775808n && value <= maximum);
    if (hasUnsigned && (!fits || present.length !== values.length)) {
      return { values: rawValues, floating: false, kind: 'string' };
    }
    if (fits) {
      const floating = present.length !== values.length;
      return {
        floating,
        kind: floating ? 'float' : hasUnsigned ? 'unsigned' : 'integer',
        values: values.map(value => value === null ? null :
          floating || Number.isSafeInteger(Number(value)) ? Number(value) : BigInt(value.trim())),
      };
    }
    return { values: values.map(value => value === null ? null : BigInt(value.trim())), floating: false, kind: 'object' };
  }
  const numeric = present.every(value =>
    /^[ \t\n\r\v\f]*[+-]?(?:(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|inf(?:inity)?)[ \t\n\r\v\f]*$/i.test(value)
      && (!/^[ \t\n\r\v\f]*[+-]?\d+[ \t\n\r\v\f]*$/.test(value) ||
        (BigInt(value.trim()) >= -9223372036854775808n && BigInt(value.trim()) <= 18446744073709551615n)));
  if (numeric) {
    return {
      floating: true,
      kind: 'float',
      values: values.map(value => value === null ? null :
        /inf/i.test(value) ? (/^\s*-/.test(value) ? -Infinity : Infinity) : pandasFloat(value)),
    };
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
  if (floating) return { values: combined.map(value => value === null ? null : Number(value)), floating: true, kind: 'float' };
  const floatingIndices = new Set();
  let offset = 0;
  for (const chunk of chunks) {
    if (chunk.floating) {
      for (let index = 0; index < chunk.values.length; index += 1) floatingIndices.add(offset + index);
    }
    offset += chunk.values.length;
  }
  return { values: combined, floating: false, floatingIndices, kind: kinds.size === 1 ? chunks[0].kind : 'object' };
}

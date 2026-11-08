import nonprintable from './format/nonprintable.json' with {type: 'json'};

function printable(code) {
  let low = 0, high = nonprintable.ranges.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const [start, end] = nonprintable.ranges[middle];
    if (code < start) high = middle - 1;
    else if (code > end) low = middle + 1;
    else return false;
  }
  return true;
}

/** Python's pinned string repr, used inside expanded string-list diagnostics. */
export function pythonStringRepr(value) {
  const quote = value.includes("'") && !value.includes('"') ? '"' : "'";
  let result = quote;
  for (const character of value) {
    const code = character.codePointAt(0);
    if (character === quote || character === '\\') result += '\\' + character;
    else if (character === '\t') result += '\\t';
    else if (character === '\n') result += '\\n';
    else if (character === '\r') result += '\\r';
    else if (printable(code)) result += character;
    else {
      const width = code <= 255 ? 2 : code <= 65535 ? 4 : 8;
      result += '\\' + (width === 2 ? 'x' : width === 4 ? 'u' : 'U') + code.toString(16).padStart(width, '0');
    }
  }
  return result + quote;
}

export function pythonString(value, floating = false) {
  if (Array.isArray(value)) return `[${value.map(pythonStringRepr).join(', ')}]`;
  if (value === null) return 'nan';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return value < 0 ? '-inf' : 'inf';
    if (floating && Object.is(value, -0)) return '-0.0';
    if (floating && value && (Math.abs(value) >= 1e16 || Math.abs(value) < 1e-4)) {
      return value.toExponential().replace(/e([+-])(\d)$/, 'e$10$2');
    }
    if (floating && Number.isInteger(value)) return `${value}.0`;
  }
  return String(value);
}

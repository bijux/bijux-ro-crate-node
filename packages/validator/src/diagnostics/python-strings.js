import nonprintable from './unicode-printability.json' with {type: 'json'};

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

/** Preserve the pinned Python string representation in user-facing diagnostics. */
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

/** JSON escapes can contain lone surrogates even when the input file is UTF-8. */
export function checkUnicodeString(value, loc, errors) {
  for (const character of value) {
    const point = character.codePointAt(0);
    if (point >= 0xD800 && point <= 0xDFFF) {
      errors.push({loc, msg: 'Input should be a valid string, unable to parse raw data as a unicode string', type: 'string_unicode'});
      return false;
    }
  }
  return true;
}

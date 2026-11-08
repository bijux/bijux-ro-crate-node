import data from './unicode-names.json' with {type: 'json'};

function characterFlags(character) {
  if (typeof character !== 'string' || !character) return 0;
  const code = character.codePointAt(0);
  if (character.length !== (code > 0xffff ? 2 : 1)) return 0;
  let low = 0, high = data.ranges.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const [start, end, flags] = data.ranges[middle];
    if (code < start) high = middle - 1;
    else if (code > end) low = middle + 1;
    else return flags;
  }
  return 0;
}

/** RDFLib's NAME_CATEGORIES for one Unicode codepoint, excluding its explicit extenders. */
export const isRDFNameCharacter = character => Boolean(characterFlags(character) & 1);
/** RDFLib's SPLIT_START_CATEGORIES; underscore is handled by its split algorithm. */
export const isRDFSplitStartCharacter = character => Boolean(characterFlags(character) & 2);
/** The pinned Python Unicode regular expression \w predicate for one codepoint. */
export const isPythonWordCharacter = character => Boolean(characterFlags(character) & 4);

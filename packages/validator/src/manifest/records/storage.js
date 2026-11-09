/*!
 * Modified JavaScript adaptation of pandas 3.0.2 tokenizer/read buffering.
 * Copyright (c) 2012, Lambda Foundry, Inc., except where noted.
 * Incorporates components of WarrenWeckesser/textreader, licensed under
 * 3-clause BSD. See NOTICE and LICENSES/pandas.txt.
 */

const overflow = () => {
  throw new Error('Error tokenizing data. C error: Buffer overflow caught - possible malformed input file.\n')
}
const grow = (length, space, capacity) => {
  while (length + space >= capacity) capacity *= 2
  return capacity
}

/** Track the pinned C tokenizer's storage independently of JavaScript allocation. */
export function tokenStorage() {
  let streamLength = 0, wordLength = 0, wordStart = 0, lastEnd = 0
  let streamCapacity = 32, wordCapacity = 3, lineCapacity = 3
  const ends = new WeakMap()
  return {
    reserve(bytes, lines) {
      streamCapacity = grow(streamLength, bytes * 2, streamCapacity)
      wordCapacity = grow(wordLength, bytes, wordCapacity)
      lineCapacity = grow(lines + 1, bytes, lineCapacity)
    },
    push() {
      if (streamLength >= streamCapacity) overflow()
      streamLength++
    },
    field(length, nul) {
      if (wordLength >= wordCapacity) overflow()
      wordLength++
      lastEnd = wordStart + (nul < 0 ? length : nul) + 1
      // end_field ignores push_char's return for the string terminator.
      if (streamLength < streamCapacity) streamLength++
      wordStart = streamLength
    },
    record(record, count) {
      if (count >= lineCapacity) overflow()
      ends.set(record, lastEnd)
    },
    consume(records, count) {
      const bytes = ends.get(records[count - 1])
      for (const row of records.slice(0, count)) wordLength -= row.cells.length
      streamLength -= bytes
      wordStart -= bytes
      lastEnd -= bytes
      for (const row of records.slice(count)) ends.set(row, ends.get(row) - bytes)
    },
  }
}

/*!
 * Modified JavaScript adaptation of pandas 3.0.2 tokenizer/read buffering.
 * Copyright (c) 2012, Lambda Foundry, Inc., except where noted.
 * Incorporates components of WarrenWeckesser/textreader, licensed under
 * 3-clause BSD. See NOTICE and LICENSES/pandas.txt.
 */

/** Tokenize pandas' default UTF-8 TSV record stream and bounded read calls. */
export function tokenizeTSVRecords(text) {
  const skipBOM = text.startsWith('\uFEFF') ? 3 : 0;
  const input = new TextEncoder().encode(text).subarray(skipBOM);
  const decoder = new TextDecoder('utf-8', {ignoreBOM: true});
  const inputChunkCharacters = 256 * 1024;
  const inputBufferStarts = new Set();
  // The reference's default TextIO reader requests Unicode characters, then
  // encodes each buffer. A BOM counts toward that request before lexing skips it.
  let characters = 0, byteOffset = -skipBOM;
  for (const character of text) {
    const code = character.codePointAt(0);
    byteOffset += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
    if (++characters % inputChunkCharacters === 0) inputBufferStarts.add(byteOffset);
  }
  let position = 0, state = 'record', fileLines = 0, finished = false;
  let cells = [], records = [];
  let fieldBytes = new Uint8Array(64), fieldLength = 0, firstNul = -1;

  function push(character) {
    if (fieldLength === fieldBytes.length) {
      const grown = new Uint8Array(fieldBytes.length * 2);
      grown.set(fieldBytes);
      fieldBytes = grown;
    }
    if (character === 0 && firstNul < 0) firstNul = fieldLength;
    fieldBytes[fieldLength++] = character;
  }
  function endField() {
    cells.push(decoder.decode(fieldBytes.subarray(0, firstNul < 0 ? fieldLength : firstNul)));
    fieldLength = 0;
    firstNul = -1;
  }
  function endLine() {
    // pandas retains buffered line metadata after each low-memory drain. Its
    // width-error boundary uses that state rather than the global record count.
    const expected = records.at(-1)?.cells.length ?? -1;
    fileLines += 1;
    if (records.length > 1 && cells.length > expected)
      throw new Error(`Error tokenizing data. C error: Expected ${expected} fields in line ${fileLines}, saw ${cells.length}\n`);
    if (records.length >= 1) while (cells.length < expected) cells.push('');
    records.push({cells, line: fileLines});
    cells = [];
  }
  function tokenize(rowLimit) {
    const target = records.length + rowLimit;
    let callStart = position;
    while (position < input.length && records.length < target) {
      if (inputBufferStarts.has(position)) callStart = position;
      const index = position, character = input[position++];
      if (state === 'record') {
        if (character === 10) {fileLines += 1; continue;}
        if (character === 13) {fileLines += 1; state = 'skipped-cr'; continue;}
        if (character === 32) {state = 'whitespace'; continue;}
        state = 'field';
      }
      if (state === 'field') {
        if (character === 10) {endField(); endLine(); state = 'record';}
        else if (character === 13) {endField(); state = 'cr';}
        else if (character === 34) state = 'quoted';
        else if (character === 9) endField();
        else {push(character); state = 'in-field';}
      } else if (state === 'in-field') {
        if (character === 10) {endField(); endLine(); state = 'record';}
        else if (character === 13) {endField(); state = 'cr';}
        else if (character === 9) {endField(); state = 'field';}
        else push(character);
      } else if (state === 'quoted') {
        if (character === 34) state = 'quote';
        else push(character);
      } else if (state === 'quote') {
        if (character === 34) {push(character); state = 'quoted';}
        else if (character === 9) {endField(); state = 'field';}
        else if (character === 10) {endField(); endLine(); state = 'record';}
        else if (character === 13) {endField(); state = 'cr';}
        else {push(character); state = 'in-field';}
      } else if (state === 'whitespace') {
        if (character === 10) {fileLines += 1; state = 'record';}
        else if (character === 13) {fileLines += 1; state = 'skipped-cr';}
        else if (character !== 32) {
          // Backtracking stops at this tokenizer call or input-buffer boundary,
          // not at an earlier CR. A bounded read can replay records here.
          let cursor = index;
          while (cursor > callStart && input[cursor] !== 10) cursor -= 1;
          position = cursor + Number(input[cursor] === 10);
          state = 'field';
        }
      } else if (state === 'skipped-cr') {
        state = 'record';
        if (character !== 9 && character !== 10) position -= 1;
      } else if (state === 'cr') {
        if (character === 10) {endLine(); state = 'record';}
        else if (character === 9) {endLine(); endField(); state = 'field';}
        else {endLine(); state = 'record'; position -= 1;}
      }
    }
    if (position === input.length && records.length < target) {
      if (state === 'quoted')
        throw new Error(`Error tokenizing data. C error: EOF inside string starting at row ${fileLines}`);
      if (['field', 'in-field', 'quote'].includes(state)) endField();
      if (!['record', 'whitespace', 'skipped-cr'].includes(state)) endLine();
      finished = true;
    }
  }

  // pandas prefetches the header and one data record before choosing its
  // width-derived low-memory row budget. These calls bound replay.
  tokenize(2);
  if (!records.length) throw new Error('No columns to parse from file');
  const header = records[0];
  const width = Math.max(header.cells.length, records[1]?.cells.length ?? 0);
  let bufferLines = 1;
  while (bufferLines * 2 < Math.floor(2 ** 20 / width)) bufferLines *= 2;
  const result = [header];
  let parserStart = 1;
  while (!finished || records.length > parserStart) {
    const buffered = records.length - parserStart;
    if (buffered < bufferLines && !finished) tokenize(bufferLines - buffered);
    const end = Math.min(parserStart + bufferLines, records.length);
    const count = end - parserStart;
    if (!count) break;
    for (let index = parserStart; index < end; index++) result.push(records[index]);
    records = records.slice(count);
    parserStart = end - count;
  }
  return result;
}

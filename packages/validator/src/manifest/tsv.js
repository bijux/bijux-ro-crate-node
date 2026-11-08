import {inferChunks} from './values.js'

/** Parse the TSV dialect and column inference used by pandas.read_csv. */
export function parseTSV(text) {
  if (typeof text !== 'string') throw new TypeError('File list content must be a string');
  text = text.replace(/^\uFEFF/, '');
  const records = [];
  let cells = [];
  let value = '';
  let quoted = false;
  let atStart = true;
  let raw = '';
  let line = 1;
  let recordLine = 1;
  let skippedCR = false;
  function endRecord() {
    cells.push(value);
    // The C parser skips empty or ASCII-space-only records. A tab is a field.
    if (/[^ ]/.test(raw)) records.push({ cells, line: recordLine });
    cells = [];
    value = '';
    raw = '';
    atStart = true;
  }
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (skippedCR) {
      skippedCR = false;
      // After a skipped CR record the C tokenizer consumes one delimiter
      // without opening an empty field. Ordinary CR records retain it.
      if (character === '\t') continue;
    }
    if (quoted) {
      raw += character;
      if (character === '"') {
        if (text[index + 1] === '"') {
          value += '"';
          raw += text[++index];
        } else quoted = false;
      } else value += character;
      if (character === '\n') line += 1;
      continue;
    }
    if (character === '\n' || character === '\r') {
      skippedCR = character === '\r' && !/[^ ]/.test(raw) && text[index + 1] !== '\n';
      endRecord();
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      line += 1;
      recordLine = line;
    } else {
      raw += character;
      if (character === '\t') {
        cells.push(value);
        value = '';
        atStart = true;
      } else if (character === '"' && atStart) {
        quoted = true;
        atStart = false;
      } else {
        value += character;
        atStart = false;
      }
    }
  }
  if (quoted) throw new Error(`Error tokenizing data. C error: EOF inside string starting at row ${recordLine - 1}`);
  if (raw || cells.length || value) endRecord();
  if (!records.length) throw new Error('No columns to parse from file');

  const unnamed = new Set();
  const header = records.shift().cells.map((name, index) => {
    name = name.split('\0', 1)[0];
    if (name) return name;
    unnamed.add(index);
    return `Unnamed: ${index}`;
  });
  const occupied = new Set(header);
  const counts = new Map();
  const names = [...header];
  // pandas reserves explicit names before assigning generated blank headers.
  // Preserve column positions while giving the explicit name its original cell.
  const order = [...header.keys()].filter(index => !unnamed.has(index)).concat([...unnamed]);
  for (const index of order) {
    const name = header[index];
    let count = counts.get(name) ?? 0;
    counts.set(name, count + 1);
    if (!count) continue;
    let replacement;
    do { replacement = `${name}.${count++}`; } while (occupied.has(replacement));
    occupied.add(replacement);
    names[index] = replacement;
  }
  const width = Math.max(header.length, records[0]?.cells.length ?? 0);
  const indexColumns = width - header.length;
  const values = names.map(() => []);
  for (const record of records) {
    if (record.cells.length > width) {
      throw new Error(`Error tokenizing data. C error: Expected ${width} fields in line ${record.line}, saw ${record.cells.length}\n`);
    }
    names.forEach((name, index) => {
      const cell = record.cells[index + indexColumns] ?? '';
      values[index].push(cell.split('\0', 1)[0]);
    });
  }
  const columns = new Map(names.map((name, index) => [name, inferChunks(values[index], width)]));
  const rows = records.map((_, index) => new Map(names.map(name => [name, columns.get(name).values[index]])));
  return { names, rows, columns };
}

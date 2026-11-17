import type {CellValue, Column} from './values.js'
import {inferChunks} from './values.js'
import {tokenizeTSVRecords} from './records.js'

export interface Table { names: string[]; rows: Map<string | undefined, CellValue>[]; columns: Map<string | undefined, Column> }

/** Parse the TSV dialect and column inference used by pandas.read_csv. */
export function parseTSV(text: string): Table {
  if (typeof text !== 'string') throw new TypeError('File list content must be a string');
  const records = tokenizeTSVRecords(text);

  const unnamed = new Set<number>();
  // The tokenizer throws when no header record exists.
  const header = records.shift()!.cells.map((name, index) => {
    if (name) return name;
    unnamed.add(index);
    return `Unnamed: ${index}`;
  });
  const occupied = new Set(header);
  const counts = new Map<string, number>();
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
  const values: string[][] = names.map(() => []);
  for (const record of records) {
    names.forEach((name, index) => {
      const cell = record.cells[index + indexColumns] ?? '';
      values[index].push(cell);
    });
  }
  const columns = new Map(names.map((name, index) => [name, inferChunks(values[index], width)]));
  // The preceding map creates a column for every name.
  const rows = records.map((_, index) => new Map(names.map(name => [name, columns.get(name)!.values[index]])));
  return { names, rows, columns };
}

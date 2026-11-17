import type {CellValue, Column} from './values.js';
import type {Table} from './tsv.js';

// pandas wheels can contract decimal accumulation into FMA instructions. Keep
// that alternative private until a file-list consumer makes it observable.
const alternatives = new WeakMap<Column, CellValue[]>();

export function retainNumericAlternative<T extends Column>(column: T, values: CellValue[]): T {
  if (column.values.some((value, index) => !Object.is(value, values[index]))) alternatives.set(column, values);
  return column;
}

export const numericAlternative = (column: Column) => alternatives.get(column);

export function alternateNumericTable(table: Table): Table | null {
  if (![...table.columns.values()].some(column => alternatives.has(column))) return null;
  const columns = new Map([...table.columns].map(([name, column]) => [name, {...column,
    values: [...(alternatives.get(column) ?? column.values)]}]));
  // Every table name was used to create a column in the map above.
  const rows = table.rows.map((_, index) => new Map(table.names.map(name => [name, columns.get(name)!.values[index]])));
  return {names: table.names, columns, rows};
}

interface Outcome { findings: unknown[]; error?: unknown; inbound?: Set<string> | null }

export function numericOutcomesAgree(left: Outcome, right: Outcome) {
  // A truthy thrown value permits property reads with JavaScript boxing semantics.
  const signature = (outcome: Outcome) => JSON.stringify({findings: outcome.findings,
    error: outcome.error ? {name: (outcome.error as {name?: unknown}).name,
      message: (outcome.error as {message?: unknown}).message} : null,
    inbound: outcome.inbound ? [...outcome.inbound].sort() : null});
  return signature(left) === signature(right);
}

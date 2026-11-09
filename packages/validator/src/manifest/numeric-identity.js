// pandas wheels can contract decimal accumulation into FMA instructions. Keep
// that alternative private until a file-list consumer makes it observable.
const alternatives = new WeakMap();

export function retainNumericAlternative(column, values) {
  if (column.values.some((value, index) => !Object.is(value, values[index]))) alternatives.set(column, values);
  return column;
}

export const numericAlternative = column => alternatives.get(column);

export function alternateNumericTable(table) {
  if (![...table.columns.values()].some(column => alternatives.has(column))) return null;
  const columns = new Map([...table.columns].map(([name, column]) => [name, {...column,
    values: [...(alternatives.get(column) ?? column.values)]}]));
  const rows = table.rows.map((_, index) => new Map(table.names.map(name => [name, columns.get(name).values[index]])));
  return {names: table.names, columns, rows};
}

export function numericOutcomesAgree(left, right) {
  const signature = outcome => JSON.stringify({findings: outcome.findings,
    error: outcome.error ? {name: outcome.error.name, message: outcome.error.message} : null,
    inbound: outcome.inbound ? [...outcome.inbound].sort() : null});
  return signature(left) === signature(right);
}

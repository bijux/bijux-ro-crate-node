const aliasesByDataset = new WeakMap<object, ReadonlyMap<string | undefined, string>>()

export function withDatatypeAliases<T extends object>(dataset: T, aliases: ReadonlyMap<string | undefined, string>): T {
  aliasesByDataset.set(dataset, aliases)
  return dataset
}

/** Keep RDFLib's empty datatype IRI distinct from an absent datatype. */
export function referenceDatatype(dataset: object, term: {datatype?: {value: string} | null}) {
  const datatype = term.datatype?.value
  const aliases = aliasesByDataset.get(dataset)
  return aliases?.has(datatype) ? aliases.get(datatype) : datatype || null
}

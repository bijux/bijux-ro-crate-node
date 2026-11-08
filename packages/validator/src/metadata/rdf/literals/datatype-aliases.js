const aliasesByDataset = new WeakMap()

export function withDatatypeAliases(dataset, aliases) {
  aliasesByDataset.set(dataset, aliases)
  return dataset
}

/** Keep RDFLib's empty datatype IRI distinct from an absent datatype. */
export function referenceDatatype(dataset, term) {
  const datatype = term.datatype?.value
  const aliases = aliasesByDataset.get(dataset)
  return aliases?.has(datatype) ? aliases.get(datatype) : datatype || null
}

/** Preserve an existing Taxon identity when a command changes only its label. */
export function taxonIdentity(previousId:string | null, identifier:string):string | null {
  if (previousId !== null && identifier === previousId) return previousId
  const match = /^NCBITaxon:(\d{1,12})$/.exec(identifier)
  if (!match) return null
  if (previousId !== null && new RegExp(`^https?://purl\\.obolibrary\\.org/obo/NCBITaxon_${match[1]}$`).test(previousId)) return previousId
  return `http://purl.obolibrary.org/obo/NCBITaxon_${match[1]}`
}

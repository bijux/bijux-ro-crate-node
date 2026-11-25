/** A term observed by an external source at a particular time. */
export interface VocabularyTerm {
  readonly source: string
  readonly identifier: string
  readonly label: string
  readonly synonyms?: readonly string[]
  readonly obsolete: boolean
  readonly retrievedAt: string
  readonly replacement?: string
  readonly version?: string
}
export interface VocabularyAssertion {readonly identifier: string; readonly label: string}
export interface VocabularyAbsence {readonly identifier:string; readonly source:string; readonly retrievedAt:string}
export type VocabularyLookup = {readonly status:'found'; readonly term:VocabularyTerm} | ({readonly status:'not-found'} & VocabularyAbsence) | {readonly status:'unavailable'}
export type VocabularyAssessment = {readonly status:'verified' | 'not-found' | 'mismatch' | 'obsolete' | 'unavailable' | 'descriptive'; readonly term?:VocabularyTerm; readonly observation?:VocabularyAbsence}

/** Compare supplied exact-lookup evidence without performing network requests. */
export function evaluateVocabularyEvidence(assertion: VocabularyAssertion, lookup: VocabularyLookup, policy: {readonly allowSynonyms?: boolean} = {}): VocabularyAssessment {
  if (!assertion.identifier.trim()) return {status:'descriptive'}
  if (lookup.status === 'unavailable') return {status:'unavailable'}
  if (lookup.status === 'not-found') return lookup.identifier === assertion.identifier ? {status:'not-found',observation:{identifier:lookup.identifier,source:lookup.source,retrievedAt:lookup.retrievedAt}} : {status:'unavailable'}
  const term = {...lookup.term, ...(lookup.term.synonyms ? {synonyms:[...lookup.term.synonyms]} : {})}
  if (assertion.identifier !== term.identifier) return {status:'mismatch', term}
  if (term.obsolete) return {status:'obsolete', term}
  if (!assertion.label.trim() || !term.label.trim()) return {status:'mismatch', term}
  if (assertion.label !== term.label && !(policy.allowSynonyms && term.synonyms?.includes(assertion.label))) return {status:'mismatch', term}
  return {status:'verified', term}
}

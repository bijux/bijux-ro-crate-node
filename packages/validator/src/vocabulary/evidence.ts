/** A term observed by an external source at a particular time. */
export interface VocabularyTerm {
  readonly source: string
  readonly identifier: string
  readonly label: string
  readonly synonyms: readonly string[]
  readonly obsolete: boolean
  readonly retrievedAt: string
  readonly replacement?: string
  readonly version?: string
}
export interface VocabularyAssertion {readonly identifier: string; readonly label: string}
export type VocabularyLookup = {readonly status:'found'; readonly term:VocabularyTerm} | {readonly status:'not-found' | 'unavailable'}
export type VocabularyAssessment = {readonly status:'verified' | 'not-found' | 'mismatch' | 'obsolete' | 'unavailable' | 'descriptive'; readonly term?:VocabularyTerm}

/** Compare supplied exact-lookup evidence without performing network requests. */
export function evaluateVocabularyEvidence(assertion: VocabularyAssertion, lookup: VocabularyLookup, policy: {readonly allowSynonyms?: boolean} = {}): VocabularyAssessment {
  if (!assertion.identifier.trim()) return {status:'descriptive'}
  if (lookup.status !== 'found') return {status:lookup.status}
  const term = {...lookup.term, synonyms:[...lookup.term.synonyms]}
  if (assertion.identifier !== term.identifier) return {status:'mismatch', term}
  if (term.obsolete) return {status:'obsolete', term}
  if (assertion.label !== term.label && !(policy.allowSynonyms && term.synonyms.includes(assertion.label))) return {status:'mismatch', term}
  return {status:'verified', term}
}

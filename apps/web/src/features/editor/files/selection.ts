/** Retain a rejected browser selection without copying file payloads or rendering the files panel. */
export interface FileSelection {
  readonly input:HTMLInputElement
  readonly mode:'files' | 'directory'
  readonly issue:string
}

const vocabularyRecoveryNotice = 'These file listings would prevent unfinished vocabulary input from being recovered. Apply or discard it first.'
const provisionalRecoveryNotice = 'These file listings would prevent the draft from being recovered. Unsaved text remains open.'

/** The rejected listing's guidance must describe the input that is still present. */
export function listingRecoveryNotice(hasPendingVocabulary:boolean):string {
  return hasPendingVocabulary ? vocabularyRecoveryNotice : provisionalRecoveryNotice
}

/** Only clear the listing's own notice when its relevant constraint has resolved. */
export function clearListingRecoveryNotice(issues:string[], reason:'listing-admitted' | 'provisional-resolved'):string[] {
  if (issues.length !== 1) return issues
  if (issues[0] === provisionalRecoveryNotice || (reason === 'listing-admitted' && issues[0] === vocabularyRecoveryNotice)) return []
  return issues
}

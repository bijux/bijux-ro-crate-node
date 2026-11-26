export type {CrateFiles, CrateValue, Severity, ValidationIssue, ValidationReport} from '@bijux/ro-crate-core'
export type {ValidationResult, ValidationOptions} from './validation/types.js'

export {validateCrate} from './validation/validate-crate.js'
export {fromDirectory} from '@bijux/ro-crate-core'

export {evaluateVocabularyEvidence} from './vocabulary/evidence.js'
export type {VocabularyTerm, VocabularyAssertion, VocabularyLookup, VocabularyAbsence, VocabularyAssessment} from './vocabulary/evidence.js'

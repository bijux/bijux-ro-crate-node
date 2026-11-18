import type {ValidationReport} from '@bijux/ro-crate-core'
export type {CrateFiles, CrateValue, Severity, ValidationIssue, ValidationReport} from '@bijux/ro-crate-core'
export type ValidationResult =
  | {status: 'valid' | 'invalid'; report: ValidationReport}
  | {status: 'incomplete'; report: ValidationReport; reason: string; stage: 'input' | 'preflight' | 'metadata' | 'file-list'}
export interface ValidationOptions {contexts?: ReadonlyMap<string, unknown>}

export {validateCrate} from './validation/validate-crate.js'
export {fromDirectory} from '@bijux/ro-crate-core'

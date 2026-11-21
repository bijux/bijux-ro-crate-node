import type {ValidationReport} from '@bijux/ro-crate-core'

export type ValidationResult =
  | {status: 'valid' | 'invalid'; report: ValidationReport}
  | {status: 'incomplete'; report: ValidationReport; reason: string; stage: 'input' | 'preflight' | 'metadata' | 'file-list'}
export interface ValidationOptions {contexts?: ReadonlyMap<string, unknown>}

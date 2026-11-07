import type {CrateFiles, ValidationOptions, ValidationResult} from './index.js'
export {fromDirectory} from '@bijux/ro-crate-core'
export interface SessionSnapshot {
  readonly session: string
  readonly revision: number
  readonly state: 'idle' | 'editing' | 'validating' | 'valid' | 'invalid' | 'incomplete'
  readonly eligible: boolean
  readonly result?: ValidationResult
}
export interface ValidatedSnapshot {
  session: string
  revision: number
  files: CrateFiles
  options: ValidationOptions
  result: ValidationResult
}
export class ValidationSession {
  constructor(configuration?: {workerFactory?: () => Worker; debounceMs?: number; timeoutMs?: number; options?: ValidationOptions})
  select(files: CrateFiles, options?: ValidationOptions): void
  edit(path: string, value: string): void
  updateOptions(options: ValidationOptions): void
  revalidate(): void
  cancel(): void
  continue(): ValidatedSnapshot
  snapshot(): SessionSnapshot
  subscribe(listener: (snapshot: SessionSnapshot) => void): () => void
  dispose(): void
}

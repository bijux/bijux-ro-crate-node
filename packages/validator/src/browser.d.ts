import type {CrateFiles, ValidationOptions} from './index.js'
export {fromDirectory} from '@bijux/ro-crate-core'
import type {SessionSnapshot, ValidatedSnapshot} from './browser/session.js'
export type {SessionSnapshot, ValidatedSnapshot} from './browser/session.js'
export class ValidationSession {
  /** Finite milliseconds: debounce is nonnegative, timeout is positive, both are at most 2147483647. */
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

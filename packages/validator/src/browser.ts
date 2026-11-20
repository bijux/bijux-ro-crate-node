import {Session} from './browser/session.js'
import type {ValidationOptions} from './index.js'
export type {SessionSnapshot, ValidatedSnapshot} from './browser/session.js'

export {fromDirectory} from '@bijux/ro-crate-core'

export interface ValidationSession extends Pick<Session, keyof Session> {}

export const ValidationSession: {
  readonly prototype: ValidationSession
  /** Finite milliseconds: debounce is nonnegative, timeout is positive, both are at most 2147483647. */
  new (configuration?: {workerFactory?: () => Worker; debounceMs?: number; timeoutMs?: number; options?: ValidationOptions}): ValidationSession
} = class ValidationSession extends Session {
  constructor(options: {workerFactory?: () => Worker; debounceMs?: number; timeoutMs?: number; options?: ValidationOptions} = {}) {
    super({workerFactory: () => new Worker(new URL('./worker.js', import.meta.url), {type: 'module'}), ...options})
  }
}

// Bundlers may rename the class binding; preserve the public constructor identity.
Object.defineProperty(ValidationSession, 'name', {value: 'ValidationSession', configurable: true})

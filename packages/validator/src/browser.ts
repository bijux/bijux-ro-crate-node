import {Session} from './browser/session.js'
import type {ValidationOptions} from './index.js'
export type {SessionSnapshot, ValidatedSnapshot} from './browser/session.js'

export {fromDirectory} from '@bijux/ro-crate-core'

export class ValidationSession extends Session {
  constructor(options: {workerFactory?: () => Worker; debounceMs?: number; timeoutMs?: number; options?: ValidationOptions} = {}) {
    super({workerFactory: () => new Worker(new URL('./worker.js', import.meta.url), {type: 'module'}), ...options})
  }
}

import {Session} from './browser/session.js'

export {fromDirectory} from '@bijux/ro-crate-core'

export class ValidationSession extends Session {
  constructor(options = {}) {
    super({workerFactory: () => new Worker(new URL('./worker.js', import.meta.url), {type: 'module'}), ...options})
  }
}

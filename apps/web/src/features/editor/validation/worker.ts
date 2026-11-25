import {ValidationSession} from '@bijux/ro-crate-validator/browser'
import workerUrl from '@bijux/ro-crate-validator/worker?url'

export function createValidationSession(): ValidationSession {
  return new ValidationSession({workerFactory: () => new Worker(workerUrl, {type: 'module'})})
}

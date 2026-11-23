import type {CrateFiles} from '@bijux/ro-crate-core'
import type {ValidationOptions, ValidationResult} from './validation/types.js'

export interface ValidationRequest {session: string; revision: number; id: number; files: CrateFiles; options?: ValidationOptions}
export interface ValidationResponse {session: string; revision: number; id: number; result: ValidationResult}

import {executeRequest} from './worker/protocol.js'

self.onmessage = ({data}: MessageEvent<unknown>) => {
  executeRequest(data).then(result => (self as typeof self & {postMessage(message: unknown): void}).postMessage(result)).catch(error => {
    // Report protocol failures through the worker's error channel, never success.
    setTimeout(() => {throw error}, 0)
  })
}

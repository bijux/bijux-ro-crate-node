import type {CrateFiles} from '@bijux/ro-crate-core'
import type {ValidationOptions, ValidationResult} from '../validation/types.js'
import {validateCrate} from '../validation/validate-crate.js'

interface IncomingRequest {session?: unknown; revision?: unknown; id?: unknown; files?: unknown; options?: unknown}

export async function executeRequest(data: unknown): Promise<{session: unknown; revision: unknown; id: unknown; result: ValidationResult}> {
  if (!data || typeof (data as IncomingRequest).session !== 'string' || !(data as IncomingRequest).session ||
      !Number.isSafeInteger((data as IncomingRequest).revision) || ((data as IncomingRequest).revision as number) < 0 ||
      !Number.isSafeInteger((data as IncomingRequest).id) || ((data as IncomingRequest).id as number) < 0 || !((data as IncomingRequest).files instanceof Map)) {
    throw new TypeError('Expected a correlated validation request with local files')
  }
  const {session, revision, id, files, options} = data as IncomingRequest
  return {session, revision, id, result: await validateCrate(files as CrateFiles, options as ValidationOptions | undefined)}
}

export {isValidationResponse} from './messages.js'

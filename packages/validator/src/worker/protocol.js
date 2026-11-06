import {validateCrate} from '../validation/validate-crate.js'

export async function executeRequest(data) {
  if (!data || typeof data.session !== 'string' || !data.session ||
      !Number.isSafeInteger(data.revision) || data.revision < 0 ||
      !Number.isSafeInteger(data.id) || data.id < 0 || !(data.files instanceof Map)) {
    throw new TypeError('Expected a correlated validation request with local files')
  }
  const {session, revision, id, files, options} = data
  return {session, revision, id, result: await validateCrate(files, options)}
}

export {isValidationResponse} from './messages.js'

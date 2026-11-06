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

export function isValidationResponse(data) {
  const result = data?.result
  if (!result || !['valid', 'invalid', 'incomplete'].includes(result.status)) return false
  if (result.status === 'incomplete' && (typeof result.reason !== 'string' ||
      !['input', 'preflight', 'metadata', 'file-list'].includes(result.stage))) return false
  const report = result.report
  if (!report || ![null, 'CRITICAL', 'ERROR', 'WARNING', 'INFO', 'DEBUG'].includes(report.highest_error_level)) return false
  return ['CRITICAL', 'ERROR', 'WARNING', 'INFO', 'DEBUG'].every(level =>
    Array.isArray(report.issues?.[level]) && report.issues[level].every(issue =>
      issue && typeof issue.message === 'string' && [10, 20, 30, 40, 50].includes(issue.severity) &&
      (issue.location_description === null || typeof issue.location_description === 'string')))
}

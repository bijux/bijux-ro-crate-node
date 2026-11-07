export function isValidationResponse(data) {
  if (typeof data?.session !== 'string' || !data.session || !Number.isSafeInteger(data.revision) ||
      data.revision < 0 || !Number.isSafeInteger(data.id) || data.id < 0) return false
  const result = data?.result
  if (!result || !['valid', 'invalid', 'incomplete'].includes(result.status)) return false
  if (result.status === 'incomplete' && (typeof result.reason !== 'string' ||
      !['input', 'preflight', 'metadata', 'file-list'].includes(result.stage))) return false
  const report = result.report
  if (!report || ![null, 'CRITICAL', 'ERROR', 'WARNING', 'INFO', 'DEBUG'].includes(report.highest_error_level)) return false
  const severities = {CRITICAL: 50, ERROR: 40, WARNING: 30, INFO: 20, DEBUG: 10}
  if (!report.issues || Object.keys(report.issues).length !== Object.keys(severities).length ||
      Object.keys(report.issues).some(level => !Object.hasOwn(severities, level))) return false
  let highest = null
  for (const [level, severity] of Object.entries(severities)) {
    const findings = report.issues?.[level]
    if (!Array.isArray(findings) || !findings.every(issue => issue && typeof issue.message === 'string' &&
        issue.severity === severity && (issue.location_description === null || typeof issue.location_description === 'string'))) return false
    if (highest === null && findings.length) highest = level
  }
  if (report.highest_error_level !== highest) return false
  const errors = report.issues.ERROR.length + report.issues.CRITICAL.length
  return result.status === 'incomplete' || (result.status === 'valid' ? errors === 0 : errors > 0)
}

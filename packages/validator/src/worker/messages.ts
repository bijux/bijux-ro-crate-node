import type {ValidationResponse} from '../worker.js'

interface IncomingIssue { message?: unknown; severity?: unknown; location_description?: unknown }
interface IncomingReport { highest_error_level?: unknown; issues?: Record<string, unknown> }
interface IncomingResult { status?: unknown; reason?: unknown; stage?: unknown; report?: unknown }
interface IncomingResponse { session?: unknown; revision?: unknown; id?: unknown; result?: unknown }

export function isValidationResponse(input: unknown): boolean {
  // Optional property reads retain the original handling of untrusted worker data.
  const data = input as IncomingResponse | null | undefined
  if (!data || !Object.hasOwn(data, 'session') || !Object.hasOwn(data, 'revision') || !Object.hasOwn(data, 'id') ||
      !Object.hasOwn(data, 'result') || typeof data?.session !== 'string' || !data.session || !Number.isSafeInteger(data.revision) ||
      (data.revision as number) < 0 || !Number.isSafeInteger(data.id) || (data.id as number) < 0) return false
  const result = data?.result as IncomingResult | null | undefined
  if (!result || !Object.hasOwn(result, 'status') || !Object.hasOwn(result, 'report') || !['valid', 'invalid', 'incomplete'].includes(result.status as string)) return false
  if (result.status === 'incomplete' && (!Object.hasOwn(result, 'reason') || !Object.hasOwn(result, 'stage') || typeof result.reason !== 'string' ||
      !['input', 'preflight', 'metadata', 'file-list'].includes(result.stage as string))) return false
  const report = result.report as IncomingReport | null | undefined
  if (!report || !Object.hasOwn(report, 'highest_error_level') || !Object.hasOwn(report, 'issues') || ![null, 'CRITICAL', 'ERROR', 'WARNING', 'INFO', 'DEBUG'].includes(report.highest_error_level as string | null)) return false
  const severities = {CRITICAL: 50, ERROR: 40, WARNING: 30, INFO: 20, DEBUG: 10}
  if (!report.issues || Object.keys(report.issues).length !== Object.keys(severities).length ||
      Object.keys(report.issues).some(level => !Object.hasOwn(severities, level))) return false
  let highest = null
  for (const [level, severity] of Object.entries(severities)) {
    const findings = report.issues?.[level]
    if (!Array.isArray(findings)) return false
    for (let index = 0; index < findings.length; index++) {
      if (!Object.hasOwn(findings, index)) return false
      const issue = findings[index] as IncomingIssue | null | undefined
      if (!issue || !Object.hasOwn(issue, 'message') ||
          !Object.hasOwn(issue, 'severity') || !Object.hasOwn(issue, 'location_description') || typeof issue.message !== 'string' || issue.severity !== severity ||
          (issue.location_description !== null && typeof issue.location_description !== 'string')) return false
    }
    if (highest === null && findings.length) highest = level
  }
  if (report.highest_error_level !== highest) return false
  const errors = (report.issues.ERROR as unknown[]).length + (report.issues.CRITICAL as unknown[]).length
  return result.status === 'incomplete' || (result.status === 'valid' ? errors === 0 : errors > 0)
}

/** Decode into a detached data-only snapshot before asserting the validated shape. */
export function decodeValidationResponse(input: unknown): ValidationResponse | undefined {
  const snapshot: unknown = structuredClone(input)
  return isValidationResponse(snapshot) ? snapshot as ValidationResponse : undefined
}

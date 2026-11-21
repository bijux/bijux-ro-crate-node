export type Severity = 'CRITICAL' | 'ERROR' | 'WARNING' | 'INFO' | 'DEBUG'
export interface ValidationIssue { message: string; severity: 10 | 20 | 30 | 40 | 50; location_description: string | null }
export interface ValidationReport { highest_error_level: Severity | null; issues: Record<Severity, ValidationIssue[]> }

export const SEVERITY: Readonly<Record<Severity, 10 | 20 | 30 | 40 | 50>> =
  Object.freeze({CRITICAL: 50, ERROR: 40, WARNING: 30, INFO: 20, DEBUG: 10})
const names = new Map<number, Severity>(Object.entries(SEVERITY).map(([name, value]) => [value, name as Severity]))

export function reportOf(findings: readonly ValidationIssue[]): ValidationReport {
  const issues = Object.fromEntries(Object.keys(SEVERITY).map(name => [name, [] as ValidationIssue[]])) as Record<Severity, ValidationIssue[]>
  let highest = 0
  for (const finding of findings) {
    const name = names.get(finding.severity)
    if (!name) throw new TypeError('Unknown diagnostic severity: ' + finding.severity)
    issues[name].push({...finding})
    highest = Math.max(highest, finding.severity)
  }
  return {highest_error_level: names.get(highest) ?? null, issues}
}

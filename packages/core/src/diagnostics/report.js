export const SEVERITY = Object.freeze({CRITICAL: 50, ERROR: 40, WARNING: 30, INFO: 20, DEBUG: 10})
const names = new Map(Object.entries(SEVERITY).map(([name, value]) => [value, name]))

export function reportOf(findings) {
  const issues = Object.fromEntries(Object.keys(SEVERITY).map(name => [name, []]))
  let highest = 0
  for (const finding of findings) {
    const name = names.get(finding.severity)
    if (!name) throw new TypeError('Unknown diagnostic severity: ' + finding.severity)
    issues[name].push({...finding})
    highest = Math.max(highest, finding.severity)
  }
  return {highest_error_level: names.get(highest) ?? null, issues}
}

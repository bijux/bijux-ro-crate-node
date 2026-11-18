import {compareResult} from '../parity/compare.mjs'
import {normalizeReport, portableCase} from '../parity/normalize.mjs'

if (false) {
  const receipt = {provenance: 'owlrl-7.1.4/closure-created-error-message', node: 'N1', message: 'error', comparison_node: 'owl-error-1'}
  const report = {highest_error_level: null, issues: {ERROR: [{message: 'error', severity: 40, location_description: null}]}}
  const capture = {name: 'case', status: 'valid', exception: null, report, generated_error_nodes: [receipt] as [typeof receipt], extra: 42 as const}
  const normalized = normalizeReport(report, null, null)
  const location: string | null = normalized.issues.ERROR[0].location_description
  const portable = portableCase(capture)
  const extra: 42 = portable.extra
  if (portable.generated_error_nodes) {
    // @ts-expect-error Normalization maps receipts to a fresh variable-length array.
    const singleton: [typeof receipt] = portable.generated_error_nodes
    void singleton
  }
  compareResult(capture, portable)
  void [location, extra]
  // @ts-expect-error Messages are normalized as strings.
  normalizeReport({highest_error_level: null, issues: {ERROR: [{message: 42, severity: 40}]}})
}

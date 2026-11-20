import {assertExecutedCases, selectCases, selectedEngines} from '../support/selection.mjs'
import {verifyCoverage} from '../support/coverage.mjs'

if (false) {
  const input = [{name: 'sample', detail: 123}] as const
  const selected = selectCases(input, {suite: 'example'})
  const detail: 123 = selected.cases[0].detail
  const engine: number = selectedEngines({chromium: 1})[0][1]
  assertExecutedCases(selected.receipt, selected.receipt.case_names)
  verifyCoverage(input, [{selection: selected.receipt, actual_executed_case_names: selected.receipt.case_names, total: 1, passed: 1}],
    {suite: 'example', source: selected.receipt.source_sha, shards: 1})
  void [detail, engine]
  // @ts-expect-error Cases must expose their stable names.
  selectCases([{detail: 1}], {suite: 'example'})
}

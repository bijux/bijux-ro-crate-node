import assert from 'node:assert/strict'

/** Exercise every complete input through the selected public validator export. */
export async function runNodeContracts(contract) {
  const selected = process.env.BIJUX_VALIDATOR_MODULE ?? '../../../packages/validator/src/index.js'
  const importedModule = new URL(selected, import.meta.url).href
  const {validateCrate} = await import(importedModule)
  const executed = []
  const outcomes = {valid: 0, invalid: 0, incomplete: 0}
  for (const item of contract.cases) {
    const result = await validateCrate(new Map(Object.entries(item.files).map(([path, value]) =>
      [path, Array.isArray(value) ? new Uint8Array(value) : value])),
    {contexts: new Map(Object.entries(item.contexts ?? {}))})
    contract.assertResult(item, result)
    outcomes[result.status]++
    executed.push(item.name)
  }
  assert.deepEqual(executed, contract.cases.map(item => item.name))
  const report = {distribution: process.env.BIJUX_VALIDATOR_MODULE ? 'installed' : 'source',
    node_version: process.versions.node, imported_module: importedModule,
    reference: contract.reference.reference, suite_sha256: contract.reference.suite_sha256,
    cases: executed.length, actual_executed_case_names: executed,
    approved_differences: contract.approvedDifferences.size,
    input_limits: contract.limits?.size ?? 0, outcomes}
  console.log(JSON.stringify(report))
  return report
}

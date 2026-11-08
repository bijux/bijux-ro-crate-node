import {cases, assertPolicyResult, reference, failOpen} from './checks.mjs'

const module = process.env.BIJUX_VALIDATOR_MODULE ?? '../../../packages/validator/src/index.js'
const importedModule = new URL(module, import.meta.url).href
const {validateCrate} = await import(importedModule)
for (const item of cases) {
  const result = await validateCrate(new Map(Object.entries(item.files)),
    {contexts: new Map(Object.entries(item.contexts ?? {}))})
  assertPolicyResult(item, result)
}
console.log(JSON.stringify({distribution: process.env.BIJUX_VALIDATOR_MODULE ? 'installed' : 'source',
  node_version: process.versions.node, imported_module: importedModule, reference: reference.reference,
  suite_sha256: reference.suite_sha256, policy_cases: cases.length, reference_disagreements: failOpen.size}))

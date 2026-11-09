import {validateCrate} from '../../../packages/validator/src/index.js'
import {cases, assertResult, reference, limits, approvedDifferences} from './checks.mjs'
const results = []
for (const item of cases) {
  const actual = await validateCrate(new Map(Object.entries(item.files)),
    {contexts: new Map(Object.entries(item.contexts ?? {}))})
  assertResult(item, actual)
  results.push({name: item.name, status: actual.status})
}
console.log(JSON.stringify({...reference, cases: cases.length, incomplete: limits.size,
  approved_differences: approvedDifferences.size, results}))

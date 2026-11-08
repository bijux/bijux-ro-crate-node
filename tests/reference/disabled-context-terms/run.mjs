import {validateCrate} from '../../../packages/validator/src/index.js'
import {cases, assertResult} from './checks.mjs'
for (const item of cases) assertResult(item, await validateCrate(new Map(Object.entries(item.files)),
  {contexts: new Map(Object.entries(item.contexts ?? {}))}))
console.log(cases.length + ' disabled context term guards passed')

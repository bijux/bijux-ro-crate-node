import test from 'node:test'
import {validateCrate} from '../../src/index.js'
import {cases, assertPolicyResult} from '../../../../tests/reference/profile-literal-targets/checks.mjs'

for (const item of cases) {
  test(item.name + ' preserves the required literal-target policy', async () => {
    const result = await validateCrate(new Map(Object.entries(item.files)),
      {contexts: new Map(Object.entries(item.contexts ?? {}))})
    assertPolicyResult(item, result)
  })
}

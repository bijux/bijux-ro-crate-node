import test from 'node:test'
import {cases, assertDiagnosticResult} from '../../../../tests/reference/blank-node-diagnostics/checks.mjs'
import {validateCrate} from '../../src/index.js'
for (const item of cases) test(item.name + ' retains the corrected RDF diagnostic contract', async () => {
  const result = await validateCrate(new Map(Object.entries(item.files)),
    {contexts: new Map(Object.entries(item.contexts ?? {}))})
  assertDiagnosticResult(item, result)
})

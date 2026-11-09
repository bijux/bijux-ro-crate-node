import {cases, assertResult, approvedDifferences, reference} from './checks.mjs';
const module = process.env.BIJUX_VALIDATOR_MODULE ?? '../../../packages/validator/src/index.js';
const importedModule = new URL(module, import.meta.url).href;
const {validateCrate} = await import(importedModule);
for (const item of cases) assertResult(item, await validateCrate(new Map(Object.entries(item.files))));
console.log(JSON.stringify({distribution: process.env.BIJUX_VALIDATOR_MODULE ? 'installed' : 'source',
  node_version: process.versions.node, imported_module: importedModule, reference: reference.reference,
  suite_sha256: reference.suite_sha256, cases: cases.length, approved_differences: approvedDifferences.size,
  actual_executed_case_names: cases.map(item => item.name)}));

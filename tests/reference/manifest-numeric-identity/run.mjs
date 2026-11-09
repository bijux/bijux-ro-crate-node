import {cases, assertNumericResult, ambiguous, original, suiteHash} from './checks.mjs';
const module = process.env.BIJUX_VALIDATOR_MODULE ?? '../../../packages/validator/src/index.js';
const importedModule = new URL(module, import.meta.url).href;
const {validateCrate} = await import(importedModule);
for (const item of cases) assertNumericResult(item, await validateCrate(new Map(Object.entries(item.files))));
console.log(JSON.stringify({distribution: process.env.BIJUX_VALIDATOR_MODULE ? 'installed' : 'source',
  node_version: process.versions.node, imported_module: importedModule,
  reference: original.commit, suite_sha256: suiteHash, cases: cases.length,
  actual_executed_case_names: cases.map(item => item.name), platform_dependent: ambiguous.size}));

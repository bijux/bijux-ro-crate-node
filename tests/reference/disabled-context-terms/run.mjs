// Generated from tests/reference/disabled-context-terms/run.mts by npm run generate:runtime; do not edit.
import { validateCrate } from '../../../packages/validator/src/index.ts';
import { cases, assertResult } from './checks.mjs';
for (const item of cases)
    assertResult(item, await validateCrate(new Map(Object.entries(item.files)), { contexts: new Map(Object.entries(item.contexts ?? {})) }));
console.log(cases.length + ' disabled context term guards passed');

// Generated from tests/package/harness/resolution-hook.mts by npm run generate:runtime; do not edit.
import { assertAllowed } from './resolution-policy.mjs';
export const resolve = async (specifier, context, nextResolve) => {
    const result = await nextResolve(specifier, context);
    assertAllowed(result.url);
    return result;
};

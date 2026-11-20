import type {ResolveHook} from 'node:module'
import {assertAllowed} from './resolution-policy.mjs'

export const resolve: ResolveHook = async (specifier, context, nextResolve) => {
  const result = await nextResolve(specifier, context)
  assertAllowed(result.url)
  return result
}

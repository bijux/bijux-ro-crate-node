import * as nodeModule from 'node:module'
import {pathToFileURL} from 'node:url'
import {assertAllowed} from './resolution-policy.mjs'

if (typeof nodeModule.registerHooks === 'function') {
  nodeModule.registerHooks({
    resolve(specifier, context, nextResolve) {
      const result = nextResolve(specifier, context)
      assertAllowed(result.url)
      return result
    },
  })
} else {
  // Older Node releases do not expose synchronous hooks; guard CommonJS
  // resolution in the loading thread as well as ESM resolution in its hook.
  const commonjs = nodeModule.Module as unknown as {_resolveFilename: (this: unknown, ...args: unknown[]) => string}
  const original = commonjs._resolveFilename
  commonjs._resolveFilename = function(this: unknown, ...args: unknown[]) {
    const result = original.apply(this, args)
    if (!nodeModule.isBuiltin(result)) assertAllowed(pathToFileURL(result).href)
    return result
  }
  nodeModule.register(new URL('./resolution-hook.mjs', import.meta.url))
}

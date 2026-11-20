import assert from 'node:assert/strict'
import {realpathSync} from 'node:fs'
import {registerHooks} from 'node:module'
import {isAbsolute, relative, sep} from 'node:path'
import {fileURLToPath} from 'node:url'

const consumer = process.env.BIJUX_CONSUMER_ROOT
assert.ok(consumer, 'Installed consumer root is required')
const root = realpathSync(consumer)
registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context)
    if (result.url.startsWith('node:')) return result
    assert.ok(result.url.startsWith('file:'), 'Runtime module is outside installed consumer: ' + result.url)
    const path = realpathSync(fileURLToPath(result.url))
    const local = relative(root, path)
    assert.ok(local !== '..' && !local.startsWith('..' + sep) && !isAbsolute(local), 'Runtime module is outside installed consumer: ' + path)
    return result
  },
})

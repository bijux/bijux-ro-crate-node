import assert from 'node:assert/strict'
import {realpathSync} from 'node:fs'
import {isAbsolute, relative, sep} from 'node:path'
import {fileURLToPath} from 'node:url'

const consumer = process.env.BIJUX_CONSUMER_ROOT
assert.ok(consumer, 'Installed consumer root is required')
const root = realpathSync(consumer)
export function assertAllowed(url: string) {
  if (url.startsWith('node:')) return
  assert.ok(url.startsWith('file:'), 'Runtime module is outside installed consumer: ' + url)
  const path = realpathSync(fileURLToPath(url))
  const local = relative(root, path)
  assert.ok(local !== '..' && !local.startsWith('..' + sep) && !isAbsolute(local), 'Runtime module is outside installed consumer: ' + path)
}

import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../../../', import.meta.url)

test('published browser declarations come from the checked TypeScript source', async () => {
  const emitted = await readFile(new URL('artifacts/types/validator/browser.d.ts', root), 'utf8')
  const published = await readFile(new URL('packages/validator/dist/browser.d.ts', root), 'utf8')
  assert.equal(published, emitted)
})

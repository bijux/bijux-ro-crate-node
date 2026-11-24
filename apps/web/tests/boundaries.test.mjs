import {test} from 'node:test'
import assert from 'node:assert/strict'
import {checkModule} from '../boundaries.mjs'

const root = '/workspace'
test('client graph rejects server modules, package internals and Node builtins', () => {
  for (const id of ['/workspace/apps/web/src/server/secrets.ts', '/workspace/packages/creator/src/private.ts', '__vite-browser-external:node:fs'])
    assert.throws(() => checkModule(id, root, true), /boundary/i, id)
  assert.doesNotThrow(() => checkModule('/workspace/packages/creator/dist/index.js', root, true))
  assert.doesNotThrow(() => checkModule('/workspace/apps/web/src/server/routes.ts', root, false))
})

test('compiled Vue client graph rejects transitive server imports', async t => {
  const {mkdir, mkdtemp, writeFile, rm} = await import('node:fs/promises')
  const {resolve} = await import('node:path')
  const {build} = await import('vite')
  const {default: vue} = await import('@vitejs/plugin-vue')
  const {boundaries} = await import('../boundaries.mjs')
  const parent = resolve('../../artifacts/work')
  await mkdir(parent, {recursive: true})
  const fixture = await mkdtemp(resolve(parent, 'app-boundaries-'))
  t.after(() => rm(fixture, {recursive: true, force: true}))
  const source = resolve(fixture, 'apps/web/src')
  await mkdir(resolve(source, 'server'), {recursive: true})
  await mkdir(resolve(fixture, 'packages'), {recursive: true})
  await writeFile(resolve(fixture, 'apps/web/package.json'), JSON.stringify({private: true}))
  await writeFile(resolve(source, 'main.js'), "import Editor from './Editor.vue'; console.log(Editor)")
  await writeFile(resolve(source, 'Editor.vue'), "<script setup>import {value} from './helper.js'; console.log(value)</script><template><p>Editor</p></template>")
  await writeFile(resolve(source, 'helper.js'), "export {value} from './server/private.js'")
  await writeFile(resolve(source, 'server/private.js'), 'export const value = 1')
  await assert.rejects(build({configFile: false, root: fixture, logLevel: 'silent', plugins: [boundaries(fixture), vue()], build: {write: false, rollupOptions: {input: resolve(source, 'main.js')}}}), /Client boundary includes server code/)
})

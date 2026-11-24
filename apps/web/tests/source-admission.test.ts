import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {checkSources} from '../source-admission.js'

test('app admission rejects JavaScript files and untyped Vue scripts', async t => {
  const parent = resolve('../../artifacts/work')
  await mkdir(parent, {recursive: true})
  const root = await mkdtemp(resolve(parent, 'app-sources-'))
  t.after(() => rm(root, {recursive: true, force: true}))
  await writeFile(resolve(root, 'entry.js'), 'export const value = 1')
  await assert.rejects(checkSources(root), /JavaScript/)
  await rm(resolve(root, 'entry.js'))
  await writeFile(resolve(root, 'Editor.vue'), '<script setup>const value = 1</script><template>{{ value }}</template>')
  await assert.rejects(checkSources(root), /TypeScript/)
  await writeFile(resolve(root, 'Editor.vue'), '<script setup lang="ts">const value: number = 1</script><template>{{ value }}</template>')
  await checkSources(root)
})

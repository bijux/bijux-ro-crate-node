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

test('app admission rejects unregistered TypeScript and unchecked Astro scripts', async t => {
  const parent = resolve('../../artifacts/work')
  await mkdir(parent, {recursive: true})
  const root = await mkdtemp(resolve(parent, 'app-coverage-'))
  t.after(() => rm(root, {recursive: true, force: true}))
  const app = resolve(root, 'web')
  await mkdir(resolve(app, 'src'), {recursive: true})
  await writeFile(resolve(root, 'tsconfig.json'), JSON.stringify({files: [], references: [{path: './web/tsconfig.json'}]}))
  await writeFile(resolve(app, 'tsconfig.json'), JSON.stringify({compilerOptions: {strict: true, noEmit: true}, include: ['src/known.ts']}))
  await writeFile(resolve(app, 'src/known.ts'), 'export const known = 1')
  const solution = resolve(root, 'tsconfig.json')
  for (const script of ['<script is:inline>unsafe()</script>', '<script type="module">unsafe()</script>', '<script src="/external.js"></script>']) {
    const page = resolve(app, 'src/page.astro')
    await writeFile(page, script)
    await assert.rejects(checkSources(app, solution), /Astro script/, script)
    await rm(page)
  }
  for (const name of ['unchecked.ts', 'src/excluded.tsx']) {
    const path = resolve(app, name)
    await writeFile(path, 'export const value = 1')
    await assert.rejects(checkSources(app, solution), /Unregistered authored TypeScript/, name)
    await rm(path)
  }
  const known = resolve(app, 'src/known.ts')
  await writeFile(known, '// @ts-nocheck\nexport const value: string = 1')
  await assert.rejects(checkSources(app, solution), /disables typechecking/)
  await writeFile(known, 'export const known = 1')
  for (const source of ['<script>\n// @ts-nocheck\nconst value = 1\n</script>', '---\n// @ts-nocheck\nconst value = 1\n---']) {
    const page = resolve(app, 'src/page.astro')
    await writeFile(page, source)
    await assert.rejects(checkSources(app, solution), /disables typechecking/)
  }
  await writeFile(resolve(app, 'src/page.astro'), '<script>const value: number = 1; console.log(value)</script>')
  await writeFile(resolve(app, 'tsconfig.json'), JSON.stringify({compilerOptions: {strict: true, noCheck: true, noEmit: true}, include: ['src/known.ts']}))
  await assert.rejects(checkSources(app, solution), /strict typechecking/)
  await writeFile(resolve(app, 'tsconfig.json'), JSON.stringify({compilerOptions: {strict: true, noEmit: true}, include: ['src/known.ts']}))
  await checkSources(app, solution)
})

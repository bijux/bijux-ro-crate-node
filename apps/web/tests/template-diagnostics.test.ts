import {test} from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'

test('framework compilers reject incorrect configuration and Vue props', async t => {
  const parent = resolve('../../artifacts/work')
  await mkdir(parent, {recursive: true})
  const fixture = await mkdtemp(resolve(parent, 'framework-diagnostics-'))
  t.after(() => rm(fixture, {recursive: true, force: true}))
  await writeFile(resolve(fixture, 'tsconfig.json'), JSON.stringify({compilerOptions: {
    strict: true, noEmit: true, skipLibCheck: false, target: 'ES2022', module: 'ESNext',
    moduleResolution: 'Bundler', types: ['node'],
  }, vueCompilerOptions: {strictTemplates: true}, include: ['*.ts', '*.vue']}))
  await writeFile(resolve(fixture, 'config.ts'), "import {defineConfig} from 'astro/config'; defineConfig({output: 'invalid-mode'})\n")
  await writeFile(resolve(fixture, 'Child.vue'), '<script setup lang="ts">\ndefineProps<{ title: string }>()\n</script>\n<template>{{ title }}</template>')
  await writeFile(resolve(fixture, 'App.vue'), '<script setup lang="ts">\nimport Child from "./Child.vue"\n</script>\n<template>\n<Child :title="42" />\n</template>')
  const compiler = resolve('../../node_modules/vue-tsc/bin/vue-tsc.js')
  const result = spawnSync(process.execPath, [compiler, '--noEmit', '-p', resolve(fixture, 'tsconfig.json')], {encoding: 'utf8'})
  assert.notEqual(result.status, 0)
  assert.match(result.stdout, /config\.ts\(1,\d+\): error TS2322:.*invalid-mode/)
  assert.match(result.stdout, /App\.vue\(5,\d+\): error TS2322:.*number.*string/)
})

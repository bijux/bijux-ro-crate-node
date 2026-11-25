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
  await writeFile(resolve(fixture, 'tsconfig.json'), JSON.stringify({
    extends: resolve('tsconfig.json'), include: ['*.ts', '*.vue'],
  }))
  await writeFile(resolve(fixture, 'config.ts'), "import {defineConfig} from 'astro/config'; defineConfig({output: 'invalid-mode'})\n")
  await writeFile(resolve(fixture, 'Child.vue'), '<script setup lang="ts">\ndefineProps<{ title: string }>()\n</script>\n<template>{{ title }}</template>')
  await writeFile(resolve(fixture, 'App.vue'), '<script setup lang="ts">\nimport Child from "./Child.vue"\n</script>\n<template>\n<Child :title="42" />\n<Child title="okay" unrecognised="value" />\n</template>')
  const compiler = resolve('../../node_modules/vue-tsc/bin/vue-tsc.js')
  const result = spawnSync(process.execPath, [compiler, '--noEmit', '-p', resolve(fixture, 'tsconfig.json')], {encoding: 'utf8'})
  assert.notEqual(result.status, 0)
  assert.match(result.stdout, /config\.ts\(1,\d+\): error TS2322:.*invalid-mode/)
  assert.match(result.stdout, /App\.vue\(5,\d+\): error TS2322:.*number.*string/)
  assert.match(result.stdout, /App\.vue\(6,\d+\): error TS2353:.*unrecognised/)
})

test('vendor declaration exception is limited to the private app project', async () => {
  const ts = await import('typescript')
  const {readFile, readdir} = await import('node:fs/promises')
  const {dirname} = await import('node:path')
  const options = (path: string) => {
    const config = ts.readConfigFile(path, ts.sys.readFile)
    assert.equal(config.error, undefined, path)
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(path), undefined, path)
    assert.deepEqual(parsed.errors, [], path)
    return parsed.options
  }
  const app = options(resolve('tsconfig.json'))
  assert.equal(app.strict, true)
  assert.equal(app.skipLibCheck, true)
  assert.equal(options(resolve('tests/tsconfig.json')).skipLibCheck, false)
  const packages = resolve('../../packages')
  for (const entry of await readdir(packages, {withFileTypes: true})) {
    if (!entry.isDirectory()) continue
    const root = resolve(packages, entry.name)
    const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')) as {private?: boolean; bijux?: {typecheck: string[]}}
    if (manifest.private) continue
    assert.ok(manifest.bijux?.typecheck.length, entry.name)
    for (const project of manifest.bijux.typecheck) {
      const compiler = options(resolve(root, project))
      assert.equal(compiler.strict, true, project)
      assert.notEqual(compiler.skipLibCheck, true, project)
    }
  }
})

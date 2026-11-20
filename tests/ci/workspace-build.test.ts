import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {test} from 'node:test'
import {fileURLToPath} from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))

test('a public workspace emits its nested declaration dependencies for installed consumers', async t => {
  const owner = resolve(root, 'artifacts/work')
  await mkdir(owner, {recursive: true})
  const fixture = await mkdtemp(resolve(owner, 'workspace-build-'))
  t.after(() => rm(fixture, {recursive: true, force: true}))
  await cp(resolve(root, 'scripts'), resolve(fixture, 'scripts'), {recursive: true})
  await symlink(resolve(root, 'node_modules'), resolve(fixture, 'node_modules'), 'dir')
  const pkg = resolve(fixture, 'packages/observations')
  await mkdir(resolve(pkg, 'src/nested'), {recursive: true})
  await writeFile(resolve(fixture, 'package.json'), JSON.stringify({private: true, type: 'module', workspaces: ['packages/*']}))
  await writeFile(resolve(pkg, 'package.json'), JSON.stringify({name: '@fixture/observations', version: '1.0.0', type: 'module', files: ['dist'], exports: {'.': {types: './dist/index.d.ts', import: './dist/index.js'}}, scripts: {test: 'node --test'}, bijux: {declarations: 'tsconfig.json', typecheck: ['tsconfig.json'], standaloneEntries: []}}))
  await writeFile(resolve(pkg, 'tsconfig.json'), JSON.stringify({compilerOptions: {strict: true, module: 'NodeNext', target: 'ES2022', rootDir: 'src', types: []}, include: ['src/**/*.ts']}))
  await writeFile(resolve(pkg, 'src/index.ts'), "export type {Observation} from './nested/observation.js'\nexport const observations = 1\n")
  await writeFile(resolve(pkg, 'src/nested/observation.ts'), "export type {Label} from './label.js'\nexport interface Observation {label: import('./label.js').Label}\n")
  await writeFile(resolve(pkg, 'src/nested/label.ts'), 'export type Label = string\n')
  const build = spawnSync(process.execPath, [resolve(fixture, 'scripts/build.mjs')], {cwd: fixture, encoding: 'utf8'})
  assert.equal(build.status, 0, build.stderr)
  assert.match(await readFile(resolve(pkg, 'dist/nested/label.d.ts'), 'utf8'), /Label/)
  const pack = spawnSync('npm', ['pack', '--pack-destination', fixture], {cwd: pkg, encoding: 'utf8'})
  assert.equal(pack.status, 0, pack.stderr)
  const consumer = resolve(fixture, 'consumer')
  await mkdir(consumer)
  await writeFile(resolve(consumer, 'package.json'), JSON.stringify({private: true, type: 'module'}))
  const install = spawnSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', resolve(fixture, pack.stdout.trim())], {cwd: consumer, encoding: 'utf8'})
  assert.equal(install.status, 0, install.stderr)
  await writeFile(resolve(consumer, 'index.ts'), "import type {Observation} from '@fixture/observations'\nconst value: Observation = {label: 'ok'}\nvoid value\n")
  const check = spawnSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--module', 'NodeNext', '--target', 'ES2022', 'index.ts'], {cwd: consumer, encoding: 'utf8'})
  assert.equal(check.status, 0, check.stdout + check.stderr)

  const manifestFile = resolve(pkg, 'package.json')
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'))
  manifest.bijux.declarations = '../escape.json'
  await writeFile(manifestFile, JSON.stringify(manifest))
  const traversal = spawnSync(process.execPath, [resolve(fixture, 'scripts/workspaces.mjs'), 'check'], {cwd: fixture, encoding: 'utf8'})
  assert.notEqual(traversal.status, 0)
  assert.match(traversal.stderr, /Invalid package-owned path/)
  await symlink(resolve(fixture, 'package.json'), resolve(pkg, 'outside.json'))
  manifest.bijux.declarations = 'outside.json'
  await writeFile(manifestFile, JSON.stringify(manifest))
  const escape = spawnSync(process.execPath, [resolve(fixture, 'scripts/workspaces.mjs'), 'check'], {cwd: fixture, encoding: 'utf8'})
  assert.notEqual(escape.status, 0)
  assert.match(escape.stderr, /escapes package/)
  manifest.bijux.declarations = 'tsconfig.json'
  manifest.exports['.'].require = './dist/index.cjs'
  await writeFile(manifestFile, JSON.stringify(manifest))
  const unsupported = spawnSync(process.execPath, [resolve(fixture, 'scripts/workspaces.mjs'), 'check'], {cwd: fixture, encoding: 'utf8'})
  assert.notEqual(unsupported.status, 0)
  assert.match(unsupported.stderr, /Unsupported export/)
  delete manifest.exports['.'].require
  manifest.dependencies = {'external-dependency': '^1.0.0'}
  await writeFile(manifestFile, JSON.stringify(manifest))
  const range = spawnSync(process.execPath, [resolve(fixture, 'scripts/workspaces.mjs'), 'check'], {cwd: fixture, encoding: 'utf8'})
  assert.notEqual(range.status, 0)
  assert.match(range.stderr, /exact release version/)
  delete manifest.dependencies
  await writeFile(manifestFile, JSON.stringify(manifest))
  await writeFile(resolve(pkg, 'src/index.ts'), 'export const invalid: string = 1\n')
  const invalid = spawnSync(process.execPath, [resolve(fixture, 'scripts/build.mjs')], {cwd: fixture, encoding: 'utf8'})
  assert.notEqual(invalid.status, 0)
  assert.match(invalid.stdout + invalid.stderr, /TS2322/)
})

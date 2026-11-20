import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile} from 'node:fs/promises'
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
  await mkdir(resolve(fixture, 'node_modules/@bijux'), {recursive: true})
  for (const dependency of await readdir(resolve(root, 'node_modules'))) {
    if (dependency !== '@bijux') await symlink(resolve(root, 'node_modules', dependency), resolve(fixture, 'node_modules', dependency))
  }
  for (const name of ['core', 'validator']) {
    await cp(resolve(root, 'packages', name), resolve(fixture, 'packages', name), {recursive: true})
    await symlink(resolve(fixture, 'packages', name), resolve(fixture, 'node_modules/@bijux', 'ro-crate-' + name), 'dir')
  }
  const pkg = resolve(fixture, 'packages/catalog')
  await mkdir(resolve(pkg, 'src/nested'), {recursive: true})
  await writeFile(resolve(fixture, 'package.json'), JSON.stringify({private: true, type: 'module', workspaces: ['packages/*']}))
  await writeFile(resolve(pkg, 'package.json'), JSON.stringify({name: '@fixture/catalog', version: '1.0.0', type: 'module', files: ['dist', 'NOTICE'], exports: {'.': {types: './dist/index.d.ts', import: './dist/index.js'}}, scripts: {test: 'node --test'}, bijux: {declarations: 'tsconfig.json', typecheck: ['tsconfig.json'], standaloneEntries: []}}))
  for (const file of ['LICENSE', 'NOTICE', 'README.md']) await writeFile(resolve(pkg, file), file + '\n')
  await writeFile(resolve(pkg, 'tsconfig.json'), JSON.stringify({compilerOptions: {strict: true, module: 'NodeNext', target: 'ES2022', rootDir: 'src', types: []}, include: ['src/**/*.ts']}))
  await writeFile(resolve(pkg, 'src/index.ts'), "/// <reference path=\"./nested/label.ts\" preserve=\"true\" />\nexport type {Observation} from './nested/observation.js'\nexport const observations = 1\nexport const marker = \"from './nested/ghost.js'\" as const\n")
  await writeFile(resolve(pkg, 'src/nested/observation.ts'), "export type {Label} from './label.js'\nexport interface Observation {label: import('./label.js').Label}\n")
  await writeFile(resolve(pkg, 'src/nested/label.ts'), 'export type Label = string\n')
  const build = spawnSync(process.execPath, [resolve(fixture, 'scripts/build.mjs')], {cwd: fixture, encoding: 'utf8'})
  assert.equal(build.status, 0, build.stderr)
  for (const name of ['@bijux/ro-crate-core', '@bijux/ro-crate-validator', '@fixture/catalog'])
    assert.match(build.stdout, new RegExp('Built ' + name))
  assert.match(await readFile(resolve(pkg, 'dist/nested/label.d.ts'), 'utf8'), /Label/)
  const pack = spawnSync('npm', ['pack', '--pack-destination', fixture], {cwd: pkg, encoding: 'utf8', env: {...process.env, npm_config_cache: resolve(root, 'artifacts/npm-cache')}})
  assert.equal(pack.status, 0, pack.stderr)
  const consumer = resolve(fixture, 'consumer')
  await mkdir(consumer)
  await writeFile(resolve(consumer, 'package.json'), JSON.stringify({private: true, type: 'module'}))
  const install = spawnSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', resolve(fixture, pack.stdout.trim())], {cwd: consumer, encoding: 'utf8', env: {...process.env, npm_config_cache: resolve(root, 'artifacts/npm-cache')}})
  assert.equal(install.status, 0, install.stderr)
  await writeFile(resolve(consumer, 'index.ts'), "import type {Observation} from '@fixture/catalog'\nconst value: Observation = {label: 'ok'}\nvoid value\n")
  const check = spawnSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--module', 'NodeNext', '--target', 'ES2022', 'index.ts'], {cwd: consumer, encoding: 'utf8'})
  assert.equal(check.status, 0, check.stdout + check.stderr)

  const completePack = spawnSync(process.execPath, [resolve(fixture, 'scripts/release/pack.mjs')], {cwd: fixture, encoding: 'utf8', env: {...process.env, npm_config_cache: resolve(root, 'artifacts/npm-cache')}})
  assert.equal(completePack.status, 0, completePack.stderr)
  const manifestFile = resolve(pkg, 'package.json')
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'))
  manifest.files = ['dist/index.js', 'dist/index.d.ts', 'dist/third-party.json', 'NOTICE']
  await writeFile(manifestFile, JSON.stringify(manifest))
  const incomplete = spawnSync('npm', ['pack', '--pack-destination', fixture], {cwd: pkg, encoding: 'utf8', env: {...process.env, npm_config_cache: resolve(root, 'artifacts/npm-cache')}})
  assert.equal(incomplete.status, 0, incomplete.stderr)
  const brokenConsumer = resolve(fixture, 'consumer-incomplete')
  await mkdir(brokenConsumer)
  await writeFile(resolve(brokenConsumer, 'package.json'), JSON.stringify({private: true, type: 'module'}))
  const brokenInstall = spawnSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', resolve(fixture, incomplete.stdout.trim())], {cwd: brokenConsumer, encoding: 'utf8', env: {...process.env, npm_config_cache: resolve(root, 'artifacts/npm-cache')}})
  assert.equal(brokenInstall.status, 0, brokenInstall.stderr)
  await writeFile(resolve(brokenConsumer, 'index.ts'), "import type {Observation} from '@fixture/catalog'\nconst value: Observation = {label: 'ok'}\nvoid value\n")
  const brokenCheck = spawnSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--module', 'NodeNext', '--target', 'ES2022', 'index.ts'], {cwd: brokenConsumer, encoding: 'utf8'})
  assert.notEqual(brokenCheck.status, 0)
  assert.match(brokenCheck.stdout + brokenCheck.stderr, /TS2307/)
  const releasePack = spawnSync(process.execPath, [resolve(fixture, 'scripts/release/pack.mjs')], {cwd: fixture, encoding: 'utf8', env: {...process.env, npm_config_cache: resolve(root, 'artifacts/npm-cache')}})
  assert.notEqual(releasePack.status, 0)
  assert.match(releasePack.stderr, /Missing packed declaration.*nested/)
  manifest.files = ['dist', 'NOTICE']
  await writeFile(manifestFile, JSON.stringify(manifest))
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
  await writeFile(resolve(pkg, 'src/nested/ambient.d.ts'), 'export interface External {value: string}\n')
  await writeFile(resolve(pkg, 'src/index.ts'), "export type {External} from /* retained */ './nested/ambient.js'\n")
  const missingImport = spawnSync(process.execPath, [resolve(fixture, 'scripts/build.mjs')], {cwd: fixture, encoding: 'utf8'})
  assert.notEqual(missingImport.status, 0)
  assert.match(missingImport.stderr, /Missing declaration dependency/)
  await writeFile(resolve(pkg, 'src/index.ts'), "export type External = import('./nested/ambient.js').External\n")
  const missingTypeImport = spawnSync(process.execPath, [resolve(fixture, 'scripts/build.mjs')], {cwd: fixture, encoding: 'utf8'})
  assert.notEqual(missingTypeImport.status, 0)
  assert.match(missingTypeImport.stderr, /Missing declaration dependency/)
  await writeFile(resolve(pkg, 'src/index.ts'), "/// <reference path=\"./nested/ambient.d.ts\" preserve=\"true\" />\nexport const value = 1\n")
  const missingReference = spawnSync(process.execPath, [resolve(fixture, 'scripts/build.mjs')], {cwd: fixture, encoding: 'utf8'})
  assert.notEqual(missingReference.status, 0)
  assert.match(missingReference.stderr, /(?:Missing declaration dependency|Declaration escapes package)/)
  await writeFile(resolve(pkg, 'src/index.ts'), 'export const invalid: string = 1\n')
  const invalid = spawnSync(process.execPath, [resolve(fixture, 'scripts/build.mjs')], {cwd: fixture, encoding: 'utf8'})
  assert.notEqual(invalid.status, 0)
  assert.match(invalid.stdout + invalid.stderr, /TS2322/)
})

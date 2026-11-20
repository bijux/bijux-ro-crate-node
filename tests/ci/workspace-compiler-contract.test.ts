import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {cp, mkdir, mkdtemp, rm, symlink, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {test, type TestContext} from 'node:test'
import {fileURLToPath} from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
async function fixture(t: TestContext) {
  const owner = resolve(root, 'artifacts/work')
  await mkdir(owner, {recursive: true})
  const directory = await mkdtemp(resolve(owner, 'compiler-contract-'))
  t.after(() => rm(directory, {recursive: true, force: true}))
  await symlink(resolve(root, 'node_modules'), resolve(directory, 'node_modules'), 'dir')
  return directory
}
const run = (directory: string, script: string, ...args: string[]) =>
  spawnSync(process.execPath, args.length ? ['--import', 'tsx', script, ...args] : [script], {cwd: directory, encoding: 'utf8'})

test('package compiler registration checks every owned source and rejects real type errors', async t => {
  const directory = await fixture(t)
  await mkdir(resolve(directory, 'scripts'), {recursive: true})
  for (const name of ['workspaces.mjs', 'typecheck.mjs']) await cp(resolve(root, 'scripts', name), resolve(directory, 'scripts', name))
  const pkg = resolve(directory, 'packages/catalog')
  await mkdir(resolve(pkg, 'src'), {recursive: true})
  await writeFile(resolve(pkg, 'package.json'), JSON.stringify({name: '@fixture/catalog', version: '1.0.0', type: 'module', exports: {'.': {types: './dist/index.d.ts', import: './dist/index.js'}}, scripts: {test: 'node --test'}, bijux: {declarations: 'tsconfig.json', typecheck: ['tsconfig.json'], standaloneEntries: []}}))
  await writeFile(resolve(pkg, 'tsconfig.json'), JSON.stringify({compilerOptions: {strict: true, noEmit: true, module: 'NodeNext', target: 'ES2022', types: []}, files: ['src/index.ts']}))
  await writeFile(resolve(pkg, 'src/index.ts'), 'export const value: string = 1\n')
  const compiler = resolve(directory, 'scripts/typecheck.mjs')
  for (const options of [{noCheck: true}, {strict: false}, {strictNullChecks: false}, {noImplicitAny: false}, {skipLibCheck: true}]) {
    await writeFile(resolve(pkg, 'tsconfig.json'), JSON.stringify({compilerOptions: {strict: true, noEmit: true, module: 'NodeNext', target: 'ES2022', types: [], ...options}, files: ['src/index.ts']}))
    const weakened = run(directory, compiler)
    assert.notEqual(weakened.status, 0)
    assert.match(weakened.stderr, /Package compiler project must enable strict typechecking/)
  }
  await writeFile(resolve(pkg, 'base.json'), JSON.stringify({compilerOptions: {strict: true, noCheck: true}}))
  await writeFile(resolve(pkg, 'tsconfig.json'), JSON.stringify({extends: './base.json', compilerOptions: {noEmit: true, module: 'NodeNext', target: 'ES2022', types: []}, files: ['src/index.ts']}))
  const inherited = run(directory, compiler)
  assert.notEqual(inherited.status, 0)
  assert.match(inherited.stderr, /Package compiler project must enable strict typechecking/)
  await writeFile(resolve(pkg, 'tsconfig.json'), JSON.stringify({compilerOptions: {strict: true, noEmit: true, module: 'NodeNext', target: 'ES2022', types: []}, files: ['src/index.ts']}))
  const invalid = run(directory, compiler)
  assert.notEqual(invalid.status, 0)
  assert.match(invalid.stdout + invalid.stderr, /TS2322/)
  await writeFile(resolve(pkg, 'src/index.ts'), 'export const value = 1\n')
  await writeFile(resolve(pkg, 'src/orphan.ts'), 'export const orphan = 1\n')
  const orphan = run(directory, compiler)
  assert.notEqual(orphan.status, 0)
  assert.match(orphan.stderr, /Unregistered authored TypeScript.*orphan\.ts/)
  await rm(resolve(pkg, 'src/orphan.ts'))
  await writeFile(resolve(directory, 'outside.ts'), 'export const outside = 1\n')
  await symlink(resolve(directory, 'outside.ts'), resolve(pkg, 'src/link.ts'))
  const link = run(directory, compiler)
  assert.notEqual(link.status, 0)
  assert.match(link.stderr, /Unsupported package symlink.*link\.ts/)
  await rm(resolve(pkg, 'src/link.ts'))
  await writeFile(resolve(pkg, 'tsconfig.unregistered.json'), JSON.stringify({files: ['src/index.ts']}))
  const project = run(directory, compiler)
  assert.notEqual(project.status, 0)
  assert.match(project.stderr, /Unregistered compiler project.*tsconfig\.unregistered\.json/)
})

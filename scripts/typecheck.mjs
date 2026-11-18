import {mkdir} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const compiler = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url))
const emptyTypes = fileURLToPath(new URL('../artifacts/types/browser', import.meta.url))
await mkdir(emptyTypes, {recursive: true})
for (const project of ['packages/core/tsconfig.json', 'packages/core/tsconfig.tests.json', 'packages/validator/tsconfig.json', 'packages/validator/tsconfig.worker.json', 'packages/validator/tsconfig.manifest-tests.json', 'tests/types/tsconfig.validator-entry.json']) {
  const source = spawnSync(process.execPath, [compiler, '-p', project, '--noEmit'], {stdio: 'inherit'})
  if (source.status !== 0) process.exit(source.status ?? 1)
}
const shared = ['--noEmit', '--strict', '--module', 'NodeNext', '--target', 'ES2022']
for (const args of [
  ['--lib', 'ES2022', '--types', 'node', 'tests/types/node.ts'],
  ['--lib', 'ES2022,DOM,DOM.Iterable', '--typeRoots', emptyTypes, 'tests/types/browser.ts'],
]) {
  const result = spawnSync(process.execPath, [compiler, ...shared, ...args], {stdio: 'inherit'})
  if (result.status !== 0) process.exit(result.status ?? 1)
}
console.log('Node-only and browser public declarations pass independently')

import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const compiler = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url))
for (const project of ['packages/core/tsconfig.json', 'packages/core/tsconfig.tests.json', 'packages/validator/tsconfig.json', 'packages/validator/tsconfig.worker.json', 'packages/validator/tsconfig.manifest-tests.json', 'packages/validator/tsconfig.tests.json', 'tests/types/tsconfig.validator-entry.json', 'tests/types/tsconfig.node.json', 'tests/types/tsconfig.browser.json', 'tests/package/tsconfig.consumers.json', 'tests/ci/tsconfig.tests.json', 'tests/browser/tsconfig.tests.json', 'tests/browser/tsconfig.harness.json', 'tests/browser/tsconfig.worker.json', 'examples/submission/tsconfig.json', 'tests/standards/tsconfig.tests.json', 'tsconfig.tooling.json']) {
  const source = spawnSync(process.execPath, [compiler, '-p', project, '--noEmit'], {stdio: 'inherit'})
  if (source.status !== 0) process.exit(source.status ?? 1)
}
const runtimeGenerator = fileURLToPath(new URL('./generate-runtime-entries.mts', import.meta.url))
const generatedRuntime = spawnSync(process.execPath, ['--import', 'tsx', runtimeGenerator, '--check'], {stdio: 'inherit'})
if (generatedRuntime.status !== 0) process.exit(generatedRuntime.status ?? 1)
console.log('Node-only and browser public declarations pass independently')

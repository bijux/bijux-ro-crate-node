import {spawnSync} from 'node:child_process'
import {readdir} from 'node:fs/promises'
import {join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const extension = /\.(?:js|cjs|mjs|ts|cts|mts)$/
const testName = /^(?:test|test-.+|.+[.-]test)\.(?:js|cjs|mjs|ts|cts|mts)$/

/** Discover JavaScript and TypeScript tests consistently across supported Node versions. */
export async function discoverTests(directory: string): Promise<string[]> {
  const files: string[] = []
  async function visit(relative: string, inTestDirectory: boolean): Promise<void> {
    const entries = await readdir(resolve(directory, relative), {withFileTypes: true})
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const path = join(relative, entry.name)
      if (entry.isDirectory()) await visit(path, inTestDirectory || entry.name === 'test')
      else if ((entry.isFile() || entry.isSymbolicLink()) && (testName.test(entry.name) || (inTestDirectory && extension.test(entry.name)))) files.push(path)
    }
  }
  await visit('', false)
  return files.sort()
}

// Node accepts these options with a separate value as well as --name=value.
const valuedOptions = new Set(['--test-name-pattern', '--test-skip-pattern', '--test-reporter',
  '--test-reporter-destination', '--test-concurrency', '--test-timeout', '--test-shard',
  '--test-coverage-lines', '--test-coverage-functions', '--test-coverage-branches', '--require', '-r', '--import'])
function hasExplicitFiles(args: string[]) {
  for (let index = 0; index < args.length; index++) {
    const value = args[index]
    if (value === '--') return index + 1 < args.length
    if (valuedOptions.has(value)) {index++; continue}
    if (!value.startsWith('-')) return true
  }
  return false
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const files = hasExplicitFiles(args) ? [] : await discoverTests(process.cwd())
  if (!hasExplicitFiles(args) && files.length === 0) throw new Error('No package test files found')
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...args, ...files], {stdio: 'inherit'})
  if (result.error) throw result.error
  if (result.signal) process.kill(process.pid, result.signal)
  process.exit(result.status ?? 1)
}

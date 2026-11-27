import {readdir, readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

export function registrationProblems(files:readonly string[], scripts:Readonly<Record<string, string>>) {
  const registered = new Set<string>()
  for (const [name, command] of Object.entries(scripts)) {
    if (name !== 'test' && !name.startsWith('test:')) continue
    for (const part of command.split('&&')) {
      if (!/^\s*node\s+.*?--test(?:\s|$)/.test(part)) continue
      for (const match of part.matchAll(/\btests\/[\w./-]+\.test\.ts\b/g)) registered.add(match[0])
    }
  }
  const present = new Set(files)
  return {
    unregistered: [...present].filter(path => !registered.has(path)).sort(),
    missing: [...registered].filter(path => !present.has(path)).sort(),
  }
}

async function testFiles(directory:URL, prefix = 'tests'):Promise<string[]> {
  const entries = await readdir(directory, {withFileTypes:true})
  const files = await Promise.all(entries.map(entry => {
    const path = `${prefix}/${entry.name}`
    if (entry.isDirectory()) return testFiles(new URL(`${entry.name}/`, directory), path)
    return entry.isFile() && entry.name.endsWith('.test.ts') ? [path] : []
  }))
  return files.flat()
}

async function main() {
  const directory = new URL('./tests/', import.meta.url)
  const manifest = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8')) as {scripts:Record<string, string>}
  const problems = registrationProblems(await testFiles(directory), manifest.scripts)
  if (problems.unregistered.length || problems.missing.length) {
    for (const path of problems.unregistered) console.error(`Unregistered app test: ${path}`)
    for (const path of problems.missing) console.error(`Missing registered app test: ${path}`)
    process.exitCode = 1
  } else console.log('All app tests are registered in test scripts.')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()

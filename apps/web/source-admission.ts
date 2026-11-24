import {readdir, readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {parse} from 'vue/compiler-sfc'

export async function checkSources(directory: string): Promise<void> {
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    if (entry.name === 'node_modules') continue
    const path = resolve(directory, entry.name)
    if (entry.isSymbolicLink()) throw new Error('App source must not be a symlink: ' + path)
    if (entry.isDirectory()) await checkSources(path)
    else if (/\.(?:js|jsx|mjs|cjs)$/.test(entry.name)) throw new Error('JavaScript app source is not admitted: ' + path)
    else if (entry.name.endsWith('.vue')) {
      const result = parse(await readFile(path, 'utf8'), {filename: path})
      if (result.errors.length) throw new Error('Invalid Vue component: ' + path)
      for (const script of [result.descriptor.script, result.descriptor.scriptSetup])
        if (script && script.lang !== 'ts') throw new Error('Vue script must use TypeScript: ' + path)
    }
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await checkSources(fileURLToPath(new URL('.', import.meta.url)))

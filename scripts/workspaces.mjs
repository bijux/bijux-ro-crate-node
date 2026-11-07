import {readdir, readFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

export const root = fileURLToPath(new URL('../', import.meta.url))

export async function packagesInOrder() {
  const packages = []
  const directories = (await readdir(new URL('../packages/', import.meta.url), {withFileTypes: true}))
    .filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
  for (const directory of directories) {
    const path = new URL(`../packages/${directory}/`, import.meta.url)
    const manifest = JSON.parse(await readFile(new URL('package.json', path), 'utf8'))
    packages.push({directory, path, manifest})
  }
  const names = new Set(packages.map(item => item.manifest.name))
  if (names.size !== packages.length) throw new Error('Duplicate workspace package name')
  const ordered = []
  while (ordered.length < packages.length) {
    const ready = packages.filter(item => !ordered.includes(item) &&
      Object.keys(item.manifest.dependencies ?? {}).every(name =>
        !names.has(name) || ordered.some(before => before.manifest.name === name)))
    if (!ready.length) throw new Error('Workspace dependency cycle')
    ordered.push(...ready)
  }
  return ordered
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2]
  const packages = await packagesInOrder()
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  if (manifest.private !== true) throw new Error('Workspace root must be private')
  for (const item of packages) {
    for (const dependency of Object.values(item.manifest.dependencies ?? {})) {
      if (/^(?:workspace|file|link):/.test(dependency)) throw new Error('Unpublishable dependency: ' + dependency)
    }
    if (command === 'test' && item.manifest.scripts?.test) {
      const result = spawnSync('npm', ['test', '--workspace', item.manifest.name], {cwd: root, stdio: 'inherit'})
      if (result.status !== 0) process.exit(result.status ?? 1)
    }
  }
  if (command === 'check') console.log(packages.map(item => item.manifest.name).join('\n'))
}

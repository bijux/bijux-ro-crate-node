import {isAbsolute, relative, resolve, sep} from 'node:path'
import {readFileSync, readdirSync, realpathSync} from 'node:fs'
import type {Plugin} from 'vite'

function inside(parent: string, child: string) {
  const part = relative(parent, child)
  return part === '' || (!isAbsolute(part) && part !== '..' && !part.startsWith('..' + sep))
}
export function checkModule(id: string, root: string, client: boolean) {
  const path = id.split('?')[0]
  if (path.includes('__vite-browser-external') || (client && /^node:/.test(path))) throw new Error('Client boundary includes a Node module: ' + id)
  if (!isAbsolute(path)) return
  let actual = path
  try {actual = realpathSync(path)} catch (error) {if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error}
  if (client && inside(resolve(root, 'apps/web/src/server'), actual)) throw new Error('Client boundary includes server code: ' + id)
  const appSource = inside(resolve(root, 'apps/web/src'), actual)
  const dependencies = inside(resolve(root, 'node_modules'), actual) || inside(resolve(root, 'apps/web/node_modules'), actual)
  const packageOutput = inside(resolve(root, 'packages'), actual) && /^packages\/[^/]+\/dist\//.test(relative(root, actual).split(sep).join('/'))
  if (!appSource && !dependencies && !packageOutput) throw new Error('App boundary includes unowned code: ' + id)
}
export function boundaries(root: string): Plugin {
  let client = false
  let serving = false
  const app = JSON.parse(readFileSync(resolve(root, 'apps/web/package.json'), 'utf8')) as {dependencies?: Record<string, string>}
  const workspaces = new Map(readdirSync(resolve(root, 'packages'), {withFileTypes: true}).filter(entry => entry.isDirectory()).map(entry => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'packages', entry.name, 'package.json'), 'utf8')) as {name: string; exports?: Record<string, unknown>}
    return [manifest.name, manifest]
  }))
  return {
    name: 'bijux-app-boundaries',
    enforce: 'pre',
    configResolved(config) {client = !config.build.ssr; serving = config.command === 'serve'},
    async resolveId(source, importer, options) {
      if (!importer || !isAbsolute(importer.split('?')[0])) return null
      const owner = importer.split('?')[0]
      const appOwned = inside(resolve(root, 'apps/web/src'), owner)
      const packageName = source.startsWith('@') ? source.split('/').slice(0, 2).join('/') : source.split('/')[0]
      const target = workspaces.get(packageName)
      if (target) {
        const exportSource = source.split('?')[0]
        const subpath = exportSource === packageName ? '.' : '.' + exportSource.slice(packageName.length)
        if ((appOwned && !Object.hasOwn(app.dependencies ?? {}, packageName)) || !Object.hasOwn(target.exports ?? {}, subpath)) throw new Error('App boundary requires a declared public package export: ' + source)
      }
      if (source.startsWith('.') || isAbsolute(source)) {
        const found = await this.resolve(source, importer, {...options, skipSelf: true})
        if (found) {
          const candidate = found.id.split('?')[0]
          let actual = candidate
          try {actual = realpathSync(candidate)} catch (error) {if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error}
          const packagesRoot = resolve(root, 'packages')
          if (inside(packagesRoot, actual)) {
            const worker = workspaces.get('@bijux/ro-crate-validator')?.exports?.['./worker']
            const workerPath = worker && typeof worker === 'object' && 'import' in worker && typeof worker.import === 'string' ? resolve(packagesRoot, 'validator', worker.import) : ''
            if (serving && source.startsWith('/@fs/') && owner === resolve(root, 'artifacts/web/project/index.html') && actual === workerPath && Object.hasOwn(app.dependencies ?? {}, '@bijux/ro-crate-validator')) return null
            const directory = relative(packagesRoot, actual).split(sep)[0]
            const ownerRoot = resolve(packagesRoot, directory)
            if (!inside(ownerRoot, owner)) throw new Error('App boundary requires public package imports: ' + source)
          }
        }
      }
      return null
    },
    generateBundle() {for (const id of this.getModuleIds()) checkModule(id, root, client)},
  }
}

import {isAbsolute, relative, resolve, sep} from 'node:path'
import {readFileSync, readdirSync} from 'node:fs'

function inside(parent, child) {
  const part = relative(parent, child)
  return part === '' || (!isAbsolute(part) && part !== '..' && !part.startsWith('..' + sep))
}
export function checkModule(id, root, client) {
  const path = id.split('?')[0]
  if (path.includes('__vite-browser-external') || (client && /^node:/.test(path))) throw new Error('Client boundary includes a Node module: ' + id)
  if (client && inside(resolve(root, 'apps/web/src/server'), path)) throw new Error('Client boundary includes server code: ' + id)
  if (inside(resolve(root, 'packages'), path) && /(?:^|\/)src(?:\/|$)/.test(path)) throw new Error('App boundary includes package source: ' + id)
}
export function boundaries(root) {
  let client = false
  const app = JSON.parse(readFileSync(resolve(root, 'apps/web/package.json'), 'utf8'))
  const workspaces = new Map(readdirSync(resolve(root, 'packages'), {withFileTypes: true}).filter(entry => entry.isDirectory()).map(entry => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'packages', entry.name, 'package.json'), 'utf8'))
    return [manifest.name, manifest]
  }))
  return {
    name: 'bijux-app-boundaries',
    enforce: 'pre',
    configResolved(config) {client = !config.build.ssr},
    async resolveId(source, importer, options) {
      if (!importer || !inside(resolve(root, 'apps/web/src'), importer.split('?')[0])) return null
      const packageName = source.startsWith('@') ? source.split('/').slice(0, 2).join('/') : source.split('/')[0]
      const target = workspaces.get(packageName)
      if (target) {
        const subpath = source === packageName ? '.' : '.' + source.slice(packageName.length)
        if (!Object.hasOwn(app.dependencies ?? {}, packageName) || !Object.hasOwn(target.exports ?? {}, subpath)) throw new Error('App boundary requires a declared public package export: ' + source)
      }
      if (source.startsWith('.') || isAbsolute(source)) {
        const found = await this.resolve(source, importer, {...options, skipSelf: true})
        if (found && inside(resolve(root, 'packages'), found.id.split('?')[0])) throw new Error('App boundary requires public package imports: ' + source)
      }
      return null
    },
    generateBundle() {for (const id of this.getModuleIds()) checkModule(id, root, client)},
  }
}

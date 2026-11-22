import {createServer} from 'node:http'
import type {AddressInfo} from 'node:net'
import {readFile, realpath} from 'node:fs/promises'
import {resolve, sep, extname} from 'node:path'
import {root} from '../workspaces.mjs'
export {root} from '../workspaces.mjs'


export async function serve(directory = root) {
  const base = resolve(directory)
  const mime: Record<string, string> = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json'}
  const server = createServer(async (request, response) => {
    try {
      const path = resolve(base, '.' + decodeURIComponent(new URL(request.url!, 'http://localhost').pathname))
      if (!path.startsWith(base + sep)) {response.writeHead(403).end(); return}
      const [physicalBase, physicalPath] = await Promise.all([realpath(base), realpath(path)])
      if (!physicalPath.startsWith(physicalBase + sep)) {response.writeHead(403).end(); return}
      const content = await readFile(physicalPath)
      response.writeHead(200, {'Content-Type': mime[extname(path)] ?? 'application/octet-stream'}).end(content)
    } catch {response.writeHead(404).end()}
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return {origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => new Promise(resolve => server.close(resolve))}
}

import {createServer} from 'node:http'
import {readFile} from 'node:fs/promises'
import {resolve, sep, extname} from 'node:path'
import {fileURLToPath} from 'node:url'

export const root = fileURLToPath(new URL('../../', import.meta.url))

export async function serve(directory = root) {
  const base = resolve(directory)
  const mime = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json'}
  const server = createServer(async (request, response) => {
    try {
      const path = resolve(base, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname))
      if (!path.startsWith(base + sep)) {response.writeHead(403).end(); return}
      const content = await readFile(path)
      response.writeHead(200, {'Content-Type': mime[extname(path)] ?? 'application/octet-stream'}).end(content)
    } catch {response.writeHead(404).end()}
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return {origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve))}
}

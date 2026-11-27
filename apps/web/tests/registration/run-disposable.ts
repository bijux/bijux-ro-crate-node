import {randomBytes} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {createServer, type Server} from 'node:net'
import {setTimeout as delay} from 'node:timers/promises'
import {fileURLToPath} from 'node:url'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const app = fileURLToPath(new URL('../../', import.meta.url))
const project = `bijuxregistration${randomBytes(8).toString('hex')}`
const compose = ['compose', '-p', project, '-f', 'ops/local-authoring/compose.yaml']
function docker(args:string[], capture = false) {
  const result = spawnSync('docker', args, {cwd:root, encoding:'utf8', stdio:capture ? 'pipe' : 'inherit', timeout:120_000})
  if (result.error || result.status !== 0) throw result.error ?? Error(`Docker command failed (${result.status})`)
  return result.stdout ?? ''
}
async function reserve(port:number): Promise<Server> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {server.once('error', reject); server.listen(port, '127.0.0.1', () => resolve())})
  return server
}
const ports:Server[] = []
try {
  for (const port of [14321, 15433, 18080]) ports.push(await reserve(port))
} finally {
  await Promise.all(ports.map(server => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))))
}
const filter = `label=com.docker.compose.project=${project}`
if (docker(['ps', '-aq', '--filter', filter], true).trim() || docker(['volume', 'ls', '-q', '--filter', filter], true).trim()) throw Error('Disposable Compose project already exists')
try {
  docker([...compose, 'up', '-d', '--wait'])
  let ready = false
  for (let attempt = 0; attempt < 90; attempt++) {
    try {if ((await fetch('http://127.0.0.1:18080/realms/authoring/.well-known/openid-configuration', {signal:AbortSignal.timeout(1000)})).ok) {ready = true; break}} catch {}
    await delay(1000)
  }
  if (!ready) throw Error('Disposable local identity did not become ready')
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', 'tests/registration/registration-journey.test.ts'], {
    cwd:app, env:{...process.env, BIJUX_REGISTRATION_PROJECT:project}, stdio:'inherit', timeout:120_000,
  })
  if (result.error || result.status !== 0) throw result.error ?? Error(`Registration journey failed (${result.status})`)
} finally {
  docker([...compose, 'down', '-v', '--remove-orphans'])
}

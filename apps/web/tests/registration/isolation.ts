import {spawn, type ChildProcess} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const app = fileURLToPath(new URL('../../', import.meta.url))
const inheritedKeys = ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'SYSTEMROOT', 'DOCKER_CONFIG', 'XDG_CONFIG_HOME', 'PLAYWRIGHT_BROWSERS_PATH'] as const
function allowedEnvironment(env:NodeJS.ProcessEnv):NodeJS.ProcessEnv {
  return Object.fromEntries(inheritedKeys.filter(key => env[key] !== undefined).map(key => [key, env[key]]))
}
export function dockerEnvironment(env:NodeJS.ProcessEnv):NodeJS.ProcessEnv {return allowedEnvironment(env)}
export function referenceEnvironment(env:NodeJS.ProcessEnv):NodeJS.ProcessEnv {
  return {...allowedEnvironment(env), HOST:'127.0.0.1', PORT:'14321', BIJUX_LOCAL_REFERENCE:'1', NODE_ENV:'development', BSS_MODE:'standalone', ASTRO_NODE_AUTOSTART:'disabled', BIJUX_LOCAL_WEB_PORT:'14321', BIJUX_LOCAL_IDENTITY_PORT:'18080', BIJUX_LOCAL_DATABASE_PORT:'15433'}
}
export function localDockerHost(env:NodeJS.ProcessEnv, inspect:(context?:string)=>string):string {
  const value = env.DOCKER_CONTEXT ? inspect(env.DOCKER_CONTEXT) : env.DOCKER_HOST ?? inspect()
  let host:URL
  try {host = new URL(value)} catch {throw Error('Docker must use a local Unix socket')}
  if (host.protocol !== 'unix:' || host.hostname || !host.pathname.startsWith('/') || host.search || host.hash) throw Error('Docker must use a local Unix socket')
  return value
}
export async function startOwnedServer(env:NodeJS.ProcessEnv, port = 14321):Promise<ChildProcess> {
  const child = spawn(process.execPath, ['--import', 'tsx', 'tests/registration/server-child.ts'], {cwd:app, env:{...env, PORT:String(port), BIJUX_LOCAL_WEB_PORT:String(port)}, stdio:['ignore', 'ignore', 'ignore', 'ipc']})
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('Local app server did not listen')), 15_000)
      const finish = (error?:Error) => {clearTimeout(timeout); child.off('message', message); child.off('exit', exit); child.off('error', failed); error ? reject(error) : resolve()}
      const message = (value:unknown) => {if (value === 'listening') finish()}
      const exit = (code:number|null) => finish(Error(`Local app server exited before listening (${code})`))
      const failed = (error:Error) => finish(Error(`Local app server failed: ${error.message}`))
      child.on('message', message); child.once('exit', exit); child.once('error', failed)
    })
    return child
  } catch (error) {child.kill(); throw error}
}

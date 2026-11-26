import {spawnSync} from 'node:child_process'
import {mkdirSync, readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {dirname, relative, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {parseEnv} from 'node:util'

const root = fileURLToPath(new URL('../../artifacts/web/project/', import.meta.url))
const config = fileURLToPath(new URL('./astro.config.ts', import.meta.url))
const require = createRequire(import.meta.url)
const astro = resolve(dirname(require.resolve('astro/package.json')), 'bin/astro.mjs')
if (!['stop', 'status', 'logs'].includes(process.argv[2] ?? '')) {
  try {
    const settings = parseEnv(readFileSync(new URL('./.env', import.meta.url), 'utf8'))
    for (const key of ['BSS_MODE', 'BSS_API_BASE_URL', 'BSS_LOCAL_SERVICE_HOST']) {
      if (process.env[key] === undefined && settings[key] !== undefined) process.env[key] = settings[key]
    }
  }
  catch (error) {if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error}
}
mkdirSync(root, {recursive:true})
const result = spawnSync(process.execPath, [astro, 'dev', '--root', root, '--config', relative(root, config), ...process.argv.slice(2)], {stdio:'inherit'})
if (result.error) throw result.error
if (result.signal) process.kill(process.pid, result.signal)
process.exit(result.status ?? 1)

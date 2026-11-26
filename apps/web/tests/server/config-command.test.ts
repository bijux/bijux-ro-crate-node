import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {cp, mkdir, mkdtemp, rm, symlink, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {test} from 'node:test'
import {fileURLToPath} from 'node:url'

const entry = fileURLToPath(new URL('../../config-check.mts', import.meta.url))
test('configuration check validates without connecting or exposing values', () => {
  for (const settings of [{BSS_MODE:'standalone'}, {BSS_MODE:'local', BSS_API_BASE_URL:'http://127.0.0.1:8000/api'}, {BSS_MODE:'connected', BSS_API_BASE_URL:'https://example.invalid/api'}]) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', entry], {env:{...process.env, ...settings}, encoding:'utf8'})
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /Environment files, connectivity and credentials were not checked/)
  }
  const secret = 'private-config-value'
  const result = spawnSync(process.execPath, ['--import', 'tsx', entry], {env:{...process.env, BSS_MODE:'local', BSS_API_BASE_URL:`http://user:${secret}@example.invalid/api`}, encoding:'utf8'})
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Invalid BSS configuration/)
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(secret))
})

test('development configuration check uses the local file with process precedence', async t => {
  const root = fileURLToPath(new URL('../../../..', import.meta.url))
  const parent = resolve(root, 'artifacts/work')
  await mkdir(parent, {recursive:true})
  const fixture = await mkdtemp(resolve(parent, 'config-check-'))
  t.after(() => rm(fixture, {recursive:true, force:true}))
  const app = resolve(fixture, 'apps/web')
  await mkdir(resolve(app, 'src/server'), {recursive:true})
  await cp(resolve(root, 'apps/web/config-check.mts'), resolve(app, 'config-check.mts'))
  await cp(resolve(root, 'apps/web/src/server/bss'), resolve(app, 'src/server/bss'), {recursive:true})
  await symlink(resolve(root, 'node_modules'), resolve(fixture, 'node_modules'), 'dir')
  const env = {...process.env}; delete env.BSS_MODE; delete env.BSS_API_BASE_URL; delete env.BSS_LOCAL_SERVICE_HOST
  const run = (settings:NodeJS.ProcessEnv, ...args:string[]) => spawnSync(process.execPath, ['--import', 'tsx', resolve(app, 'config-check.mts'), ...args], {cwd:app, env:{...env, ...settings}, encoding:'utf8'})
  const secret = 'private-development-value'
  await writeFile(resolve(app, '.env'), `BSS_MODE=local\nBSS_API_BASE_URL=http://user:${secret}@127.0.0.1/api\n`)
  assert.equal(run({}).status, 0, 'process-only check must not load the file')
  const invalid = run({}, '--development')
  assert.equal(invalid.status, 1, 'development check must validate the file')
  assert.doesNotMatch(invalid.stdout + invalid.stderr, new RegExp(secret))
  const override = run({BSS_MODE:'standalone'}, '--development')
  assert.equal(override.status, 0, override.stderr)
})

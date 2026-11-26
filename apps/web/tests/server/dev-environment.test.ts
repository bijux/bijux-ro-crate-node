import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises'
import {createServer} from 'node:net'
import {resolve} from 'node:path'
import {test} from 'node:test'
import {fileURLToPath} from 'node:url'

const repository = fileURLToPath(new URL('../../../..', import.meta.url))
test('development startup validates settings from the app environment file', async t => {
  const work = resolve(repository, 'artifacts/work')
  await mkdir(work, {recursive:true})
  const fixture = await mkdtemp(resolve(work, 'web-env-'))
  t.after(() => rm(fixture, {recursive:true, force:true}))
  const app = resolve(fixture, 'apps/web'), original = resolve(repository, 'apps/web')
  await mkdir(app, {recursive:true})
  for (const file of ['dev.mts', 'astro.config.ts', 'boundaries.ts', 'package.json', 'src', 'public']) await cp(resolve(original, file), resolve(app, file), {recursive:true})
  await symlink(resolve(repository, 'node_modules'), resolve(fixture, 'node_modules'), 'dir')
  await symlink(resolve(repository, 'packages'), resolve(fixture, 'packages'), 'dir')
  await symlink(resolve(original, 'node_modules'), resolve(app, 'node_modules'), 'dir')
  const probe = createServer(); await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve))
  const address = probe.address(); if (!address || typeof address === 'string') throw Error('Could not allocate a local test port')
  const port = address.port; await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()))
  const env = {...process.env}; delete env.BSS_MODE; delete env.BSS_API_BASE_URL; delete env.BSS_LOCAL_SERVICE_HOST; delete env.NODE_OPTIONS
  const run = (settings:NodeJS.ProcessEnv, ...args:string[]) => spawnSync(process.execPath, ['--import', 'tsx', resolve(app, 'dev.mts'), ...args], {cwd:app, env:{...env, ...settings}, encoding:'utf8'})
  const start = (settings:NodeJS.ProcessEnv = {}) => run(settings, '--background', '--port', String(port), '--host', '127.0.0.1')
  try {
    await writeFile(resolve(app, '.env'), 'BSS_MODE=standalone\nNODE_OPTIONS=--this-is-not-a-valid-node-option\n')
    const valid = start(); assert.equal(valid.status, 0, valid.stderr)
    const secret = 'private-env-value'
    await writeFile(resolve(app, '.env'), `BSS_MODE=local\nBSS_API_BASE_URL=http://user:${secret}@127.0.0.1/api\n`)
    assert.equal(run({}, 'stop').status, 0)
    const invalid = start()
    const log = await readFile(resolve(fixture, 'artifacts/web/project/.astro/dev.log'), 'utf8').catch(() => '')
    assert.notEqual(invalid.status, 0, 'invalid local BSS settings must prevent startup')
    assert.match(invalid.stderr + log, /Invalid BSS configuration/)
    assert.doesNotMatch(invalid.stderr + log, new RegExp(secret))
    const override = start({BSS_MODE:'standalone'})
    assert.equal(override.status, 0, override.stderr)
    await rm(resolve(app, '.env'))
    await mkdir(resolve(app, '.env'))
    assert.equal(run({}, 'stop').status, 0, 'stop must not read the environment file')
  } finally {run({}, 'stop')}
})

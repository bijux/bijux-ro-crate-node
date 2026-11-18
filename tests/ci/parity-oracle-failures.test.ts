import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import test from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))

test('oracle failures report the child exit after an early or fully read stdin', async t => {
  await mkdir(resolve(root, 'artifacts/work'), {recursive: true})
  const directory = await mkdtemp(resolve(root, 'artifacts/work/oracle-failure-'))
  t.after(() => rm(directory, {recursive: true, force: true}))
  const preload = resolve(directory, 'child-control.cjs')
  await writeFile(preload, `
if (require('node:path').basename(process.argv[1] ?? '') === 'run.mjs' && process.env.BIJUX_ORACLE_FAILURE_CONTROL === 'ioerror') {
  const childProcess = require('node:child_process'), spawn = childProcess.spawn
  childProcess.spawn = (...args) => {
    const child = spawn(...args)
    process.nextTick(() => child.stdin.emit('error', Object.assign(new Error('controlled stdin failure'), {code: 'EIO'})))
    return child
  }
  require('node:module').syncBuiltinESMExports()
}
if (require('node:path').basename(process.argv[1] ?? '') === 'oracle.py') {
  if (process.env.BIJUX_ORACLE_FAILURE_CONTROL === 'consume') require('node:fs').readFileSync(0)
  process.stderr.write('controlled oracle failure\\n')
  if (process.env.BIJUX_ORACLE_FAILURE_CONTROL === 'signal') process.kill(process.pid, 'SIGTERM')
  else process.exit(process.env.BIJUX_ORACLE_FAILURE_CONTROL === 'zero' ? 0 : 7)
}
`)
  for (const mode of ['immediate', 'consume', 'zero', 'signal', 'ioerror', 'spawn']) {
    const child = spawnSync(process.execPath, ['--import', 'tsx', 'tests/parity/run.mjs', '--oracle-only'], {
      cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024,
      env: {...process.env, NODE_OPTIONS: '--require=' + JSON.stringify(preload), BIA_PYTHON: mode === 'spawn' ? resolve(directory, 'missing-python') : process.execPath,
        BIJUX_TEST_SHARD: '0/64', BIJUX_ORACLE_FAILURE_CONTROL: mode},
    })
    assert.equal(child.status, 1, child.stderr)
    if (mode === 'spawn') assert.match(child.stderr, /ENOENT/, mode)
    else if (mode === 'ioerror') assert.match(child.stderr, /controlled stdin failure/, mode)
    else if (mode === 'zero') assert.match(child.stderr, /EPIPE/, mode)
    else if (mode === 'signal') assert.match(child.stderr, /Oracle failed SIGTERM/, mode)
    else assert.match(child.stderr, /Oracle failed 7.*controlled oracle failure/s, mode)
    assert.doesNotMatch(child.stderr, /Unhandled 'error' event/, mode)
  }
})

import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {test} from 'node:test'
import {fileURLToPath} from 'node:url'

const entry = fileURLToPath(new URL('../../../../artifacts/web/dist/server/entry.mjs', import.meta.url))

test('the built server rejects invalid BSS configuration before listening without disclosing it', async () => {
  const secret = 'private-startup-value'
  const child = spawn(process.execPath, [entry], {env: {...process.env, HOST: '127.0.0.1', PORT: '0', BSS_MODE: 'local', BSS_API_BASE_URL: `http://user:${secret}@example.com/api`}, stdio: ['ignore', 'pipe', 'pipe']})
  let output = ''
  child.stdout.on('data', data => {output += String(data)})
  child.stderr.on('data', data => {output += String(data)})
  const timer = setTimeout(() => child.kill(), 2500)
  const [code] = await once(child, 'exit')
  clearTimeout(timer)
  assert.equal(code, 1, `expected startup failure; output: ${output}`)
  assert.match(output, /Invalid BSS configuration/)
  assert.doesNotMatch(output, new RegExp(secret))
  assert.doesNotMatch(output, /listening/i)
})

for (const [name, settings] of [
  ['standalone', {BSS_MODE: 'standalone', BSS_API_BASE_URL: ''}],
  ['local', {BSS_MODE: 'local', BSS_API_BASE_URL: 'http://127.0.0.1:8000/api'}],
] as const) {
  test(`the built server starts in ${name} mode without requiring an upstream connection`, async () => {
    const child = spawn(process.execPath, [entry], {env: {...process.env, ...settings, HOST: '127.0.0.1', PORT: '0'}, stdio: ['ignore', 'pipe', 'pipe']})
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('server did not start')), 5000)
        child.stdout.on('data', data => {if (String(data).includes('Server listening')) {clearTimeout(timer); resolve()}})
        child.once('exit', () => {clearTimeout(timer); reject(new Error('server exited before listening'))})
        child.once('error', error => {clearTimeout(timer); reject(error)})
      })
    } finally {
      child.kill()
      if (child.exitCode === null && child.signalCode === null) await once(child, 'exit')
    }
  })
}

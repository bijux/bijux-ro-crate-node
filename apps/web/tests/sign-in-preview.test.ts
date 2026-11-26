import assert from 'node:assert/strict'
import {spawn, type ChildProcess} from 'node:child_process'
import {once} from 'node:events'
import {test} from 'node:test'
import {fileURLToPath} from 'node:url'
import {chromium} from 'playwright'

async function stop(server: ChildProcess) {
  if (server.exitCode !== null || server.signalCode !== null) return
  const exit = once(server, 'exit')
  server.kill()
  await exit
}

const base = 'http://127.0.0.1:49381'
test('local submission designs cannot collect credentials or create submissions', async () => {
  const cli = fileURLToPath(new URL('../../../node_modules/astro/bin/astro.mjs', import.meta.url))
  const server = spawn(process.execPath, [cli, 'dev', '--ignore-lock', '--host', '127.0.0.1', '--port', '49381'], {cwd:new URL('..', import.meta.url), stdio:'ignore'})
  let browser
  try {
    for (let attempt = 0;; attempt++) {
      try {if ((await fetch(base)).ok) break} catch {}
      if (attempt === 100 || server.exitCode !== null) throw Error('Development server did not start')
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    browser = await chromium.launch({headless:true})
    const page = await browser.newPage({viewport:{width:375,height:812}})
    const response = await page.goto(base + '/preview/sign-in')
    assert.equal(response?.status(), 200)
    await page.getByText('Local design preview', {exact:true}).waitFor()
    assert.equal(await page.getByLabel('Username').isDisabled(), true)
    assert.equal(await page.getByLabel('Password').isDisabled(), true)
    assert.equal(await page.getByRole('button', {name:'Sign in'}).isDisabled(), true)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    const list = await page.goto(base + '/preview/submissions')
    assert.equal(list?.status(), 200)
    await page.getByText('Local design preview — sample data', {exact:true}).waitFor()
    assert.equal(await page.getByRole('button', {name:'Create submission'}).isDisabled(), true)
    await page.getByLabel('Search submissions').waitFor({state:'visible'})
    await page.waitForFunction(() => !(document.getElementById('submission-search') as HTMLInputElement | null)?.disabled)
    await page.getByLabel('Search submissions').fill('zebrafish')
    await page.getByText('Zebrafish imaging study', {exact:true}).waitFor()
    assert.equal(await page.getByText('Mouse imaging study', {exact:true}).count(), 0)
    await page.getByLabel('Search submissions').fill('does-not-exist')
    await page.getByText('0 sample submissions shown.', {exact:true}).waitFor()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  } finally {await browser?.close(); await stop(server)}
})


test('submission design previews are unavailable in the built server', async () => {
  const server = spawn(process.execPath, ['../../artifacts/web/dist/server/entry.mjs'], {cwd:new URL('..', import.meta.url), env:{...process.env, HOST:'127.0.0.1', PORT:'49382', NODE_ENV:'production'}, stdio:'ignore'})
  try {
    for (let attempt = 0;; attempt++) {
      try {if ((await fetch('http://127.0.0.1:49382/')).ok) break} catch {}
      if (attempt === 100 || server.exitCode !== null) throw Error('Built server did not start')
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.equal((await fetch('http://127.0.0.1:49382/preview/sign-in')).status, 404)
    assert.equal((await fetch('http://127.0.0.1:49382/preview/submissions')).status, 404)
  } finally {await stop(server)}
})

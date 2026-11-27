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
  const server = spawn(process.execPath, [cli, 'dev', '--ignore-lock', '--host', '127.0.0.1', '--port', '49381'], {cwd:new URL('..', import.meta.url), env:{...process.env, BIJUX_LOCAL_REFERENCE:'0', BSS_MODE:'standalone'}, stdio:'ignore'})
  let browser
  try {
    for (let attempt = 0;; attempt++) {
      try {if ((await fetch(base)).ok) break} catch {}
      if (attempt === 100 || server.exitCode !== null) throw Error('Development server did not start')
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    browser = await chromium.launch({headless:true})
    const unhydrated = await browser.newContext({javaScriptEnabled:false})
    const staticPage = await unhydrated.newPage()
    await staticPage.goto(base)
    assert.equal(await staticPage.getByRole('button', {name:'Create study'}).isDisabled(), true)
    await unhydrated.close()
    const page = await browser.newPage({viewport:{width:375,height:812}})
    page.setDefaultTimeout(5000)
    const failed:string[] = []
    page.on('response', response => {const url = new URL(response.url()); if (url.origin === base && response.status() >= 400) failed.push(`${response.status()} ${url.pathname}`)})
    page.on('pageerror', error => failed.push(error.message))
    const response = await page.goto(base + '/preview/sign-in')
    assert.equal(response?.status(), 200)
    await page.getByText('Local design preview', {exact:true}).waitFor()
    assert.equal(await page.getByRole('link', {name:'Open study editor'}).getAttribute('href'), '/')
    assert.equal(await page.getByRole('link', {name:'View local recovery copies'}).getAttribute('href'), '/#recovery')
    assert.equal(await page.getByLabel('Username').isDisabled(), true)
    assert.equal(await page.getByLabel('Password').isDisabled(), true)
    assert.equal(await page.getByRole('button', {name:'Sign in'}).isDisabled(), true)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.getByRole('link', {name:'View sample submissions'}).click()
    await page.getByText('Local design preview — sample data', {exact:true}).waitFor()
    await page.getByLabel('Search submissions').waitFor({state:'visible'})
    await page.waitForFunction(() => !(document.getElementById('submission-search') as HTMLInputElement | null)?.disabled)
    await page.getByLabel('Search submissions').fill('zebrafish')
    await page.getByText('Zebrafish imaging study', {exact:true}).waitFor()
    assert.equal(await page.getByText('Mouse imaging study', {exact:true}).count(), 0)
    await page.getByLabel('Search submissions').fill('does-not-exist')
    await page.getByText('0 sample submissions shown.', {exact:true}).waitFor()
    assert.equal(await page.getByRole('link', {name:'Create study'}).getAttribute('href'), '/')
    assert.equal(await page.getByRole('link', {name:'View local recovery copies'}).getAttribute('href'), '/#recovery')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.getByRole('link', {name:'View create design'}).click()
    await page.getByLabel('Study title').fill('Local example')
    await page.getByLabel('Planned release date').fill('2030-01-01')
    assert.equal(await page.getByRole('button', {name:'Create submission'}).isDisabled(), true)
    await page.getByRole('link', {name:'Open study editor'}).click()
    await page.getByRole('button', {name:'Create study'}).click()
    await page.getByLabel('Study title').fill('Local study')
    await page.getByRole('navigation', {name:'Mobile study sections', exact:true}).getByRole('link', {name:'Validate crate'}).click()
    await page.getByText(/Validation: invalid/).waitFor()
    await page.getByRole('navigation', {name:'Local submission previews'}).getByRole('link', {name:'Sample submissions'}).click()
    await page.getByRole('heading', {name:'My submissions'}).waitFor()
    await page.getByRole('link', {name:'View local recovery copies'}).click()
    await page.getByRole('heading', {name:'Local recovery'}).waitFor()
    assert.deepEqual(failed, [])
    const otherPackageFile = fileURLToPath(new URL('../../../packages/validator/dist/index.js', import.meta.url))
    assert.equal((await fetch(base + '/@fs' + otherPackageFile)).status, 500)
  } finally {await browser?.close(); await stop(server)}
})


test('submission design previews are unavailable in the built server', async () => {
  const server = spawn(process.execPath, ['../../artifacts/web/dist/server/entry.mjs'], {
    cwd:new URL('..', import.meta.url),
    env:{...process.env, HOST:'127.0.0.1', PORT:'0', NODE_ENV:'production', BSS_MODE:'standalone', BIJUX_LOCAL_REFERENCE:'0'},
    stdio:['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  const capture = (chunk:Buffer) => {output = (output + chunk.toString()).slice(-8192)}
  server.stdout.on('data', capture)
  server.stderr.on('data', capture)
  try {
    let address: string | undefined
    for (let attempt = 0; attempt <= 100; attempt++) {
      address = output.match(/Server listening on (http:\/\/127\.0\.0\.1:\d+)/)?.[1]
      if (address) break
      if (server.exitCode !== null || server.signalCode !== null) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (!address) throw Error(`Built server did not start (exit ${server.exitCode ?? server.signalCode ?? 'timeout'}). Output: ${output}`)
    assert.equal((await fetch(address + '/preview/sign-in')).status, 404)
    assert.equal((await fetch(address + '/preview/submissions')).status, 404)
    assert.equal((await fetch(address + '/preview/create')).status, 404)
  } finally {await stop(server)}
})

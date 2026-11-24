import {test} from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {chromium} from 'playwright'

const base = 'http://127.0.0.1:4329'
test('a researcher edits and downloads the current study metadata', async () => {
  const server = spawn(process.execPath, ['../../artifacts/web/dist/server/entry.mjs'], {
    cwd: new URL('..', import.meta.url), env: {...process.env, HOST: '127.0.0.1', PORT: '4329'}, stdio: 'ignore',
  })
  let browser
  try {
    for (let attempt = 0; ; attempt++) {
      try { if ((await fetch(base)).ok) break } catch {}
      if (attempt === 100 || server.exitCode !== null) throw new Error('Built application did not start')
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    browser = await chromium.launch({headless: true})
    const page = await browser.newPage({acceptDownloads: true})
    await page.goto(base)
    await page.getByRole('button', {name: 'Create study'}).click()
    await page.getByLabel('Study title').fill('Microscopy study')
    await page.getByLabel('Description').fill('An example study')
    await page.getByLabel('License').fill('https://creativecommons.org/licenses/by/4.0/')
    const download = page.waitForEvent('download')
    await page.getByRole('button', {name: 'Download metadata'}).click()
    const file = await download
    assert.equal(file.suggestedFilename(), 'ro-crate-metadata.json')
    const chunks = []
    for await (const chunk of await file.createReadStream()) chunks.push(chunk)
    const metadata = JSON.parse(Buffer.concat(chunks).toString())
    const study = metadata['@graph'].find(item => item['@id'] === './')
    assert.equal(study.name, 'Microscopy study')
    assert.equal(study.description, 'An example study')
    assert.equal(study.license, 'https://creativecommons.org/licenses/by/4.0/')
    assert.match(await page.getByRole('status').innerText(), /not saved/i)
    await page.setViewportSize({width: 390, height: 844})
    const guidance = page.getByRole('button', {name: /study guidance/i})
    assert.equal(await guidance.getAttribute('aria-expanded'), 'false')
    await guidance.click()
    assert.equal(await guidance.getAttribute('aria-expanded'), 'true')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
  } finally {
    await browser?.close()
    server.kill()
  }
})

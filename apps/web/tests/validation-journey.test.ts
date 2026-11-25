import {test} from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {chromium} from 'playwright'

const base = 'http://127.0.0.1:4331'
test('the built editor validates a fresh draft in its packaged worker', async () => {
  const server = spawn(process.execPath, ['../../artifacts/web/dist/server/entry.mjs'], {cwd: new URL('..', import.meta.url), env: {...process.env, HOST: '127.0.0.1', PORT: '4331'}, stdio: 'ignore'})
  let browser
  try {
    for (let attempt = 0; ; attempt++) {
      try {if ((await fetch(base)).ok) break} catch {}
      if (attempt === 100 || server.exitCode !== null) throw Error('Built application did not start')
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    browser = await chromium.launch({headless: true})
    const page = await browser.newPage()
    const workers: string[] = []
    page.on('worker', worker => workers.push(worker.url()))
    await page.goto(base)
    await page.getByRole('navigation', {name: 'Study sections', exact: true}).getByRole('link', {name: 'Validate crate'}).click()
    await page.getByText(/Validation: blocked/).waitFor()
    assert.equal(await page.getByRole('button', {name: 'Continue'}).isDisabled(), true)
    await page.getByRole('navigation', {name: 'Study sections', exact: true}).getByRole('link', {name: 'Study details'}).click()
    await page.getByRole('button', {name: 'Create study'}).click()
    await page.getByRole('navigation', {name: 'Study sections', exact: true}).getByRole('link', {name: 'Validate crate'}).click()
    await page.getByText(/Validation: invalid/).waitFor()
    assert.equal(await page.getByRole('button', {name: 'Continue'}).isDisabled(), true)
    assert.ok(workers.some(url => /worker.*\.js/.test(url)))
    const navigation = page.getByRole('navigation', {name: 'Study sections', exact: true})
    await navigation.getByRole('link', {name: 'Files', exact: true}).click()
    await page.locator('#file-input').setInputFiles({name: 'pending.tif', mimeType: 'image/tiff', buffer: Buffer.from('x')})
    await navigation.getByRole('link', {name: 'Validate crate'}).click()
    await page.getByText(/Assign or remove pending file listings before validation/).waitFor()
    assert.equal(await page.getByRole('button', {name: 'Continue'}).isDisabled(), true)
    await navigation.getByRole('link', {name: 'Files', exact: true}).click()
    await page.getByRole('button', {name: 'Remove listing'}).click()
    await navigation.getByRole('link', {name: 'Validate crate'}).click()
    await page.getByText(/Validation: invalid/).waitFor()
    await page.getByLabel('Payload files').setInputFiles({name: 'image.tif', mimeType: 'image/tiff', buffer: Buffer.from('image')})
    assert.equal(await page.getByRole('button', {name: 'Continue'}).isDisabled(), true)
    await page.getByText(/Validation: invalid/).waitFor()
  } finally {await browser?.close(); server.kill(); await new Promise<void>(resolve => server.once('exit', () => resolve()))}
})

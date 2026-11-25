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
    await page.getByLabel('Payload files').setInputFiles([{name: 'image.tif', mimeType: 'image/tiff', buffer: Buffer.from('a')}, {name: 'image.tif', mimeType: 'image/tiff', buffer: Buffer.from('b')}])
    await page.getByText(/Duplicate selected path: image.tif/).waitFor()
    assert.equal(await page.getByRole('button', {name: 'Continue'}).isDisabled(), true)
    await page.getByLabel('Payload files').setInputFiles({name: 'image.tif', mimeType: 'image/tiff', buffer: Buffer.from('image')})
    assert.equal(await page.getByRole('button', {name: 'Continue'}).isDisabled(), true)
    await page.getByText(/Validation: invalid/).waitFor()
  } finally {await browser?.close(); server.kill(); await new Promise<void>(resolve => server.once('exit', () => resolve()))}
})

test('the same selected folder matches listed crate-relative payload paths', async () => {
  const {mkdir, writeFile} = await import('node:fs/promises')
  const {fileURLToPath} = await import('node:url')
  const folder = fileURLToPath(new URL('../../../artifacts/web/validation-directory/', import.meta.url))
  await mkdir(folder + '/nested', {recursive: true})
  await writeFile(folder + '/nested/image.tif', 'image')
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
    await page.goto(base)
    await page.getByRole('button', {name: 'Create study'}).click()
    const nav = (name: string) => page.getByRole('navigation', {name: 'Study sections', exact: true}).getByRole('link', {name, exact: true}).click()
    await nav('Specimens')
    await page.getByRole('button', {name: 'Add specimen'}).click()
    await page.getByLabel('Specimen label 1').fill('Sample')
    await nav('Datasets')
    await page.getByRole('button', {name: 'Add dataset'}).click()
    await page.getByLabel('Dataset name 1').fill('Data')
    await nav('Files')
    await page.getByLabel('List a directory').setInputFiles(folder)
    await page.getByLabel('Select page').check()
    await page.getByLabel('Dataset for selected files').selectOption({index: 1})
    await page.getByLabel('Specimen for selected files').selectOption({index: 1})
    await page.getByRole('button', {name: 'Preview assignment'}).click()
    await page.getByRole('button', {name: 'Apply assignment'}).click()
    await nav('Validate crate')
    await page.getByLabel('Or select a payload folder').setInputFiles(folder)
    assert.equal(await page.getByText('All listed payload names are in the current selection.', {exact: false}).count(), 1)
    await page.getByText(/Validation: invalid/).waitFor()
  } finally {await browser?.close(); server.kill(); await new Promise<void>(resolve => server.once('exit', () => resolve()))}
})

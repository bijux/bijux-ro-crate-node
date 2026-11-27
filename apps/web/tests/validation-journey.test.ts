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
    await page.addInitScript(() => {
      const observed: {requests: unknown[]; responses: unknown[]} = {requests: [], responses: []}
      ;(window as unknown as {validationWorkerTraffic: typeof observed}).validationWorkerTraffic = observed
      const NativeWorker = window.Worker
      window.Worker = class extends NativeWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options)
          this.addEventListener('message', event => observed.responses.push(structuredClone(event.data)))
        }
        override postMessage(message: unknown, transferOrOptions?: Transferable[] | StructuredSerializeOptions): void {
          observed.requests.push(structuredClone(message))
          if (Array.isArray(transferOrOptions)) super.postMessage(message, transferOrOptions)
          else super.postMessage(message, transferOrOptions)
        }
      }
    })
    const workers: string[] = []
    page.on('worker', worker => workers.push(worker.url()))
    await page.goto(base)
    await page.getByRole('navigation', {name: 'Study sections', exact: true}).getByRole('link', {name: 'Validate crate'}).click()
    await page.getByText(/Validation: blocked/).waitFor()
    assert.equal(await page.getByRole('button', {name: 'Continue'}).isDisabled(), true)
    await page.getByRole('navigation', {name: 'Study sections', exact: true}).getByRole('link', {name: 'Study details'}).click()
    await page.getByRole('button', {name: 'Create study'}).click()
    const live = page.getByRole('region', {name: 'Live validation'})
    await live.getByText(/Validation: invalid/).waitFor({timeout: 5000})
    assert.ok(await live.locator('li').count() > 0)
    await page.getByRole('navigation', {name: 'Study sections', exact: true}).getByRole('link', {name: 'Validate crate'}).click()
    await page.getByText(/Validation: invalid/).waitFor()
    assert.equal(await page.getByRole('button', {name: 'Continue'}).isDisabled(), true)
    assert.ok(workers.some(url => /worker.*\.js/.test(url)))
    const [downloaded] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: 'Download validation report'}).click()])
    const stream = await downloaded.createReadStream()
    let json = ''
    for await (const chunk of stream) json += chunk.toString()
    const result = JSON.parse(json) as {status: string; report: {issues: Record<string, {message: string; location_description: string | null}[]>}}
    assert.equal(result.status, 'invalid')
    const traffic = await page.evaluate(() => (window as unknown as {validationWorkerTraffic: {requests: {session: string; revision: number; id: number}[]; responses: {session: string; revision: number; id: number; result: unknown}[]}}).validationWorkerTraffic)
    const request = traffic.requests.at(-1)
    const response = traffic.responses.at(-1)
    assert.ok(request && response)
    assert.deepEqual({session: response.session, revision: response.revision, id: response.id}, {session: request.session, revision: request.revision, id: request.id})
    assert.deepEqual(result, response.result)
    for (const [severity, findings] of Object.entries(result.report.issues)) {
      assert.equal(await page.getByRole('heading', {name: `${severity} (${findings.length})`}).count(), 1)
      for (const finding of findings) assert.ok(await page.getByText(finding.message, {exact: true}).count() > 0)
    }
    assert.equal(await page.getByText('Submission readiness is not configured.', {exact: true}).count(), 1)
    const navigation = page.getByRole('navigation', {name: 'Study sections', exact: true})
    await navigation.getByRole('link', {name: 'Study details'}).click()
    await page.getByLabel('Study title').fill('A changed study')
    await live.getByText(/Validation: invalid/).waitFor()
    assert.ok(await live.locator('li').count() > 0)
    await navigation.getByRole('link', {name: 'Validate crate'}).click()
    assert.equal(await page.getByRole('button', {name: 'Continue'}).isDisabled(), true)
    await page.getByText(/Validation: invalid/).waitFor()
    await navigation.getByRole('link', {name: 'Files', exact: true}).click()
    await page.locator('#file-input').setInputFiles({name: 'pending.tif', mimeType: 'image/tiff', buffer: Buffer.from('x')})
    await live.getByText(/Assign or remove pending file listings before validation/).waitFor()
    assert.equal(await live.locator('li').count(), 0)
    await navigation.getByRole('link', {name: 'Validate crate'}).click()
    await page.getByText(/Assign or remove pending file listings before validation/).waitFor()
    assert.equal(await page.getByRole('button', {name: 'Download validation report'}).count(), 0)
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

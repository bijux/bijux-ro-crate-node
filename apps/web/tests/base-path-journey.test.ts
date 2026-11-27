import {test} from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {createServer, request} from 'node:http'
import type {AddressInfo} from 'node:net'
import {chromium} from 'playwright'

test('the built editor and its worker run through a path-prefix proxy', async () => {
  const reservation = createServer()
  await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve))
  const port = (reservation.address() as AddressInfo).port
  await new Promise<void>(resolve => reservation.close(() => resolve()))
  const server = spawn(process.execPath, ['../../artifacts/web/dist/server/entry.mjs'], {
    cwd: new URL('..', import.meta.url), env: {...process.env, HOST:'127.0.0.1', PORT:String(port), BSS_MODE:'standalone', BIJUX_LOCAL_REFERENCE:'1', NODE_ENV:'production'}, stdio:'ignore',
  })
  const proxy = createServer((incoming, outgoing) => {
    if (!incoming.url?.startsWith('/creator/')) {outgoing.writeHead(404).end(); return}
    const forwarded = request({host:'127.0.0.1', port, path:'/' + incoming.url.slice('/creator/'.length), method:incoming.method, headers:incoming.headers}, response => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers); response.pipe(outgoing)
    })
    forwarded.on('error', () => outgoing.writeHead(502).end())
    incoming.pipe(forwarded)
  })
  let browser
  try {
    await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve))
    for (let attempt = 0; ; attempt++) {
      if (server.exitCode !== null) throw Error('Built application did not start')
      try {if ((await fetch(`http://127.0.0.1:${port}/`)).ok && server.exitCode === null) break} catch {}
      if (attempt === 100 || server.exitCode !== null) throw Error('Built application did not start')
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    browser = await chromium.launch({headless:true})
    const page = await browser.newPage({acceptDownloads:true})
    const failures:string[] = [], workers:string[] = [], requests:string[] = []
    const origin = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`
    page.on('request', request => {const url = new URL(request.url()); if (url.protocol.startsWith('http')) requests.push(url.origin === origin ? url.pathname : url.href)})
    page.on('response', response => {const path = new URL(response.url()).pathname; if (response.status() >= 400) failures.push(path)})
    page.on('worker', worker => workers.push(worker.url()))
    await page.goto(origin + '/creator/', {waitUntil:'networkidle'})
    await page.reload({waitUntil:'networkidle'})
    assert.deepEqual(failures, [], 'All application resources must use the mounted prefix')
    await page.getByRole('button', {name:'Create study'}).click({timeout:5000})
    await page.getByLabel('Study title').fill('Prefix test study')
    const navigation = page.getByRole('navigation', {name:'Study sections', exact:true})
    await page.route('**/api/vocabulary?*', route => route.fulfill({status:200, contentType:'application/json', body:JSON.stringify({status:'ok', suggestions:[]})}))
    await navigation.getByRole('link', {name:'Biosamples'}).click()
    await page.getByRole('button', {name:'Add biosample'}).click()
    const organism = page.getByRole('group', {name:'Add organism to biosample 1'})
    await organism.getByLabel('Add organism to biosample 1 label').fill('human')
    await organism.getByRole('button', {name:'Search suggestions for Add organism to biosample 1'}).click()
    await organism.getByText('No suggestions found.').waitFor()
    await organism.getByRole('button', {name:'Discard changes for Add organism to biosample 1'}).click()
    await navigation.getByRole('link', {name:'Validate crate'}).click()
    await page.getByText(/Validation: invalid/).waitFor({timeout:10000})
    assert.ok(workers.some(url => url.startsWith(origin + '/creator/')))
    await navigation.getByRole('link', {name:'Export metadata'}).click()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name:'Download metadata'}).click()])
    const chunks:Buffer[] = []
    for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
    const metadata = JSON.parse(Buffer.concat(chunks).toString()) as {'@graph':Array<Record<string, unknown>>}
    assert.equal(metadata['@graph'].find(item => item['@id'] === './')?.name, 'Prefix test study')
    assert.ok(requests.includes('/creator/visual-framework/css/styles.css'))
    assert.ok(!requests.includes('/creator/api/local/session'))
    assert.ok(requests.includes('/creator/api/vocabulary'))
    assert.ok(requests.every(path => path.startsWith('/creator/')))
    assert.deepEqual(failures, [])
  } finally {
    await browser?.close()
    await new Promise<void>(resolve => proxy.close(() => resolve()))
    if (server.exitCode === null) {server.kill(); await new Promise<void>(resolve => server.once('exit', () => resolve()))}
  }
})

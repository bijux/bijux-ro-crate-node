import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile, mkdir, writeFile} from 'node:fs/promises'
import {createServer} from 'node:http'
import {resolve, extname} from 'node:path'
import {build} from 'vite'
import {chromium} from 'playwright'

test('concurrent recovery writes use atomic revision preconditions', async () => {
  const root = resolve('../..'), output = resolve(root,'artifacts/web/recovery-harness')
  await mkdir(output,{recursive:true})
  const html = resolve(output,'index.html')
  await writeFile(html,'<!doctype html><script type="module" src="/apps/web/tests/recovery-store-harness.ts"></script>')
  await build({root,configFile:false,publicDir:false,logLevel:'error',build:{outDir:resolve(output,'dist'),emptyOutDir:true,rollupOptions:{input:html}}})
  const dist = resolve(output,'dist')
  const server = createServer(async (request,response) => {
    const path = resolve(dist,'.' + (request.url === '/' ? '/artifacts/web/recovery-harness/index.html' : request.url!.split('?')[0]))
    if (!path.startsWith(dist + '/')) {response.writeHead(403).end(); return}
    try {response.setHeader('Content-Type',extname(path) === '.js' ? 'text/javascript' : 'text/html'); response.end(await readFile(path))} catch {response.writeHead(404).end()}
  })
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve))
  const address = server.address(); if (!address || typeof address === 'string') throw Error('server address')
  let browser
  try {
    browser = await chromium.launch({headless:true})
    const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${address.port}/`)
    const result = await page.evaluate(async () => {
      const store = (window as unknown as {recoveryStore:{save:(id:string,expected:number | null,backup:string) => Promise<{revision:number}>;list:() => Promise<Array<{backup:string}>>}}).recoveryStore
      const first = await store.save('shared',null,'first')
      const writes = await Promise.allSettled([store.save('shared',first.revision,'second'),store.save('shared',first.revision,'third')])
      return {states:writes.map(value => value.status).sort(),records:await store.list()}
    })
    assert.deepEqual(result.states,['fulfilled','rejected'])
    assert.equal(result.records.length,1)
    assert.ok(['second','third'].includes(result.records[0].backup))
  } finally {await browser?.close(); await new Promise<void>(resolve => server.close(() => resolve()))}
})

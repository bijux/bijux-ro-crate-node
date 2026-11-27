import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile, mkdir, writeFile} from 'node:fs/promises'
import {createServer} from 'node:http'
import {resolve, extname} from 'node:path'
import {build} from 'vite'
import {chromium} from 'playwright'

test('built package worker validates current selected bytes in a browser', async () => {
  const root = resolve('../..')
  const output = resolve(root, 'artifacts/web/validation-harness')
  await mkdir(output, {recursive: true})
  const html = resolve(output, 'index.html')
  await writeFile(html, '<!doctype html><script type="module" src="/apps/web/tests/validation-harness.ts"></script>')
  await build({root, configFile: false, publicDir: false, logLevel: 'error', build: {outDir: resolve(output, 'dist'), emptyOutDir: true, rollupOptions: {input: html}}})
  const dist = resolve(output, 'dist')
  const server = createServer(async (request, response) => {
    const path = resolve(dist, '.' + (request.url === '/' ? '/artifacts/web/validation-harness/index.html' : request.url!.split('?')[0]))
    if (!path.startsWith(dist + '/')) {response.writeHead(403).end(); return}
    try {const contents = await readFile(path); response.setHeader('Content-Type', extname(path) === '.js' ? 'text/javascript' : 'text/html'); response.end(contents)}
    catch {response.writeHead(404).end()}
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw Error('server address')
  let browser
  try {
    browser = await chromium.launch({headless: true})
    const page = await browser.newPage()
    const workers: string[] = []
    page.on('worker', worker => workers.push(worker.url()))
    await page.goto(`http://127.0.0.1:${address.port}/`)
    const fixture = resolve(root, 'tests/parity/fixtures/test_minimal_valid_ro_crate')
    const metadata = await readFile(resolve(fixture, 'ro-crate-metadata.json'), 'utf8')
    const manifest = await readFile(resolve(fixture, 'file_list.tsv'), 'utf8')
    const run = (files: Record<string, string>) => page.evaluate(files => (window as unknown as {validateFiles: (files: Record<string, string>) => Promise<{state: string; eligible: boolean; files: string[]}>}).validateFiles(files), files)
    const valid = await run({'ro-crate-metadata.json': metadata, 'file_list.tsv': manifest})
    assert.equal(valid.state, 'valid')
    assert.equal(valid.eligible, true)
    assert.deepEqual(valid.files.sort(), ['file_list.tsv', 'ro-crate-metadata.json'])
    assert.ok(workers.some(url => /worker.*\.js/.test(url)))
    const large = await page.evaluate(() => (window as unknown as {validateFiles:(files:Record<string,string>) => Promise<{state:string}>}).validateFiles({'ro-crate-metadata.json':JSON.stringify({description:'x'.repeat(17 * 1024 * 1024)})}))
    assert.equal(large.state, 'invalid', 'large valid JSON text must reach validation')
    const malformed = await run({'ro-crate-metadata.json': '{', 'file_list.tsv': manifest})
    assert.equal(malformed.eligible, false)
    const missingMetadata = await run({'file_list.tsv': manifest})
    assert.equal(missingMetadata.eligible, false)
    assert.notEqual(missingMetadata.state, 'valid')
    const removed = await run({'ro-crate-metadata.json': metadata})
    assert.equal(removed.eligible, false)
    const typical = resolve(root, 'tests/parity/fixtures/test_typical_ro_crate')
    const typicalMetadata = await readFile(resolve(typical, 'ro-crate-metadata.json'), 'utf8')
    const typicalManifest = await readFile(resolve(typical, 'file_list.tsv'), 'utf8')
    const paths = typicalManifest.trimEnd().split('\n').slice(1).map(row => row.split('\t')[0])
    const selected = Object.fromEntries(paths.map(path => [path, '']))
    const complete: Record<string, string> = {'ro-crate-metadata.json': typicalMetadata, 'file_list.tsv': typicalManifest, ...selected}
    const before = await run(complete)
    assert.equal(before.eligible, true)
    delete complete[paths[0]]
    const after = await run(complete)
    assert.equal(after.eligible, true)
    assert.equal(after.files.includes(paths[0]), false)
  } finally {await browser?.close(); await new Promise<void>(resolve => server.close(() => resolve()))}
})

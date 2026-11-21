import {writeFile, cp, realpath} from 'node:fs/promises'
import {isAbsolute, relative, resolve, sep} from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'

export async function prepareApps(directory: string, core: {name: string}, validator: {name: string}) {
  await writeFile(resolve(directory, 'index.html'), `<!doctype html><html><head><script type="importmap">${JSON.stringify({imports:{
    [core.name]: '/node_modules/' + core.name + '/dist/index.js',
    [validator.name]: '/node_modules/' + validator.name + '/dist/index.js',
    [validator.name + '/browser']: '/node_modules/' + validator.name + '/dist/browser.js'}})}</script></head><body><script type="module" src="/app.mjs"></script></body></html>`)
  const bundle = await build({absWorkingDir: directory, entryPoints: ['app.mjs'], outfile: 'bundle.js', bundle: true, platform: 'browser', format: 'esm', target: 'es2022', metafile: true})
  const root = await realpath(directory)
  for (const input of Object.keys(bundle.metafile.inputs)) {
    const path = await realpath(resolve(directory, input))
    const local = relative(root, path)
    assert.ok(local !== '..' && !local.startsWith('..' + sep) && !isAbsolute(local), 'Browser bundle input is outside installed consumer: ' + path)
  }
  await cp(resolve(directory, 'node_modules', validator.name, 'dist/worker.js'), resolve(directory, 'worker.js'))
  await writeFile(resolve(directory, 'bundled.html'), '<!doctype html><html><body><script type="module" src="/bundle.js"></script></body></html>')
}

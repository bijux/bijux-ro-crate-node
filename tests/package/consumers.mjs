import assert from 'node:assert/strict'
import {readFile, writeFile, mkdir, rm, cp, realpath} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {resolve, relative, basename} from 'node:path'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {build} from 'esbuild'
import {chromium, firefox, webkit} from 'playwright'
import {serve, root} from '../browser/host.mjs'
import {selectedEngines} from '../ci/selection.mjs'

function run(command, args, cwd, extraEnv = {}) {
  const result = spawnSync(command, args, {cwd, encoding: 'utf8', timeout: 300000, killSignal: 'SIGKILL', env: {...process.env,
    npm_config_cache: resolve(root, 'artifacts/cache/npm'), npm_config_logs_dir: resolve(root, 'artifacts/logs/npm'), ...extraEnv}})
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`)
  return result.stdout
}

const packages = JSON.parse(await readFile(resolve(root, 'artifacts/packages/manifest.json'), 'utf8'))
  .map(item => ({...item, archive: resolve(root, 'artifacts/packages', basename(item.archive))}))
const core = packages.find(item => item.directory === 'core')
const validator = packages.find(item => item.directory === 'validator')
assert.ok(core && validator)

const args = process.argv.slice(2)
assert.ok(args.length <= 1 && args.every(value => ['--prepare', '--verify', '--node', '--browser-apps', '--browser-guards'].includes(value)), 'Unknown package qualification mode')
const mode = args[0] ?? '--all'
const reports = []
const pinnedNodes = ['22.23.4', '24.3.0']
const installedCorePath = '/artifacts/consumers/validator/node_modules/' + core.name + '/dist/index.js'
const installedPaths = {
  BIJUX_BROWSER_CORE_PATH: installedCorePath,
  BIJUX_BROWSER_VALIDATOR_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/index.js',
  BIJUX_BROWSER_SESSION_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/browser.js',
  BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
}
const proofPath = resolve(root, 'artifacts/consumers/proof.json')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const portable = path => relative(root, path).replaceAll('\\', '/')

async function archiveProof() {
  for (const item of packages) {
    const bytes = await readFile(item.archive)
    assert.equal(sha256(bytes), item.sha256, 'Package archive SHA-256 mismatch')
    const [algorithm, digest] = item.integrity.split('-')
    assert.equal(createHash(algorithm).update(bytes).digest('base64'), digest, 'Package archive integrity mismatch')
  }
}

async function consumerProof() {
  await archiveProof()
  const consumers = []
  for (const [name, selected] of [['core', [core]], ['validator', [core, validator]]]) {
    const directory = resolve(root, 'artifacts/consumers', name)
    const lock = JSON.parse(await readFile(resolve(directory, 'package-lock.json'), 'utf8'))
    const installed = []
    for (const item of selected) {
      assert.equal(lock.packages['node_modules/' + item.name].integrity, item.integrity, 'Installed archive integrity mismatch')
      const url = run('node', ['--input-type=module', '--eval', `console.log(import.meta.resolve(${JSON.stringify(item.name)}))`], directory).trim()
      assert.ok((await realpath(fileURLToPath(url))).startsWith(directory + '/node_modules/'), 'Consumer resolved a source-workspace fallback')
      const files = []
      for (const path of item.files) {
        const target = resolve(directory, 'node_modules', item.name, path)
        assert.ok((await realpath(target)).startsWith(directory + '/node_modules/'), 'Installed file escapes the consumer')
        files.push({path, sha256: sha256(await readFile(target))})
      }
      installed.push({name: item.name, archive: portable(item.archive), sha256: item.sha256,
        integrity: item.integrity, entry: portable(fileURLToPath(url)), files})
    }
    consumers.push({name, directory: portable(directory), packages: installed})
  }
  return {consumers, installedPaths}
}

async function verifyPrepared() {
  const expected = JSON.parse(await readFile(proofPath, 'utf8'))
  const actual = await consumerProof()
  assert.deepEqual(actual, expected, 'Prepared consumer contents differ from their package proof')
  return actual
}

async function prepare() {
  await archiveProof()
  const typeDirectory = resolve(root, 'artifacts/tools/consumer-types')
  await mkdir(typeDirectory, {recursive: true})
  const rootLock = JSON.parse(await readFile(resolve(root, 'package-lock.json'), 'utf8'))
  const typeArchives = []
  for (const name of ['@types/node', 'undici-types']) {
    const installed = resolve(root, 'node_modules', name)
    const manifest = JSON.parse(await readFile(resolve(installed, 'package.json'), 'utf8'))
    assert.equal(manifest.version, rootLock.packages['node_modules/' + name].version)
    const [packed] = JSON.parse(run('npm', ['pack', installed, '--ignore-scripts', '--pack-destination', typeDirectory, '--json'], root))
    typeArchives.push(resolve(typeDirectory, packed.filename))
  }
  for (const [name, selected] of [['core', [core]], ['validator', [core, validator]]]) {
    const directory = resolve(root, 'artifacts/consumers', name)
    await rm(directory, {recursive: true, force: true})
    await mkdir(directory, {recursive: true})
    await writeFile(resolve(directory, 'package.json'), JSON.stringify({name: `bijux-${name}-consumer`, version: '1.0.0', private: true, type: 'module'}))
    run('npm', ['install', '--ignore-scripts', '--offline', '--no-audit', ...selected.map(item => item.archive)], directory)
    const lock = JSON.parse(await readFile(resolve(directory, 'package-lock.json'), 'utf8'))
    for (const item of selected) assert.equal(lock.packages['node_modules/' + item.name].integrity, item.integrity, 'Installed archive integrity mismatch')
    for (const item of selected) {
      const url = run('node', ['--input-type=module', '--eval', `console.log(import.meta.resolve(${JSON.stringify(item.name)}))`], directory).trim()
      assert.ok((await realpath(fileURLToPath(url))).startsWith(directory + '/node_modules/'), 'Consumer resolved a source-workspace fallback')
    }
    const contextFiles = name === 'validator' ? await Promise.all(['ro-crate-metadata.json', 'file_list.tsv']
      .map(async path => [path, await readFile(resolve(root, 'tests/parity/fixtures/test_minimal_valid_ro_crate', path), 'utf8')])) : []
    const code = name === 'core' ? `
import assert from 'node:assert/strict'
import {createWorkspace, reportOf} from '${core.name}'
const workspace = createWorkspace(new Map([['x','value']]))
assert.equal(await workspace.readText('x'), 'value')
assert.equal(workspace.resolveFile('./x'), 'x')
assert.equal(workspace.resolveFile('missing/../x'), null)
assert.equal(reportOf([]).highest_error_level,null)
` : `
import assert from 'node:assert/strict'
import {validateCrate} from '${validator.name}'
assert.equal((await validateCrate(new Map())).status,'incomplete')
assert.ok(import.meta.resolve('${validator.name}/worker').endsWith('/dist/worker.js'))
assert.ok(import.meta.resolve('${validator.name}/browser').endsWith('/dist/browser.js'))
const selected = new Map(${JSON.stringify(contextFiles)})
const url = 'https://example.org/contexts/propagation'
const document = JSON.parse(selected.get('ro-crate-metadata.json'))
document['@context'].push(url)
selected.set('ro-crate-metadata.json', JSON.stringify(document))
for (const serialized of [false, true]) for (const propagate of [false, true]) {
  const context = {'@context': {'@propagate': propagate}}
  const result = await validateCrate(selected, {contexts: new Map([[url, serialized ? JSON.stringify(context) : context]])})
  assert.equal(result.status, 'valid')
  assert.equal(result.report.highest_error_level, null)
  assert.deepEqual(result.report.issues.ERROR, [])
}
`
    await writeFile(resolve(directory, 'consumer.mjs'), code)
    const nodeTypes = name === 'core' ? `
import {createWorkspace, fromDirectory} from '${core.name}'
const entry = Object.assign(new Blob(['value']), {name: 'metadata', webkitRelativePath: 'crate/metadata'})
const files = fromDirectory([entry]); const selectedPath: string | null = createWorkspace(files).resolveFile('./metadata'); void selectedPath
` : `
import {validateCrate, type CrateFiles} from '${validator.name}'
import type {ValidationRequest} from '${validator.name}/worker'
const files: CrateFiles = new Map([['x', 'value']]); void validateCrate(files)
const request: ValidationRequest = {session: 'node', revision: 1, id: 1, files}; void request
`
    run('npm', ['install', '--save-dev', '--ignore-scripts', '--offline', '--no-audit', ...typeArchives], directory)
    await writeFile(resolve(directory, 'node.ts'), nodeTypes)
    const compiler = resolve(root, 'node_modules/typescript/bin/tsc')
    const sharedTypes = ['--noEmit', '--strict', '--module', 'nodenext', '--target', 'ES2022']
    run('node', [compiler, ...sharedTypes, '--lib', 'ES2022', '--typeRoots', resolve(directory, 'node_modules/@types'), '--types', 'node', 'node.ts'], directory)
    const types = name === 'core' ? `
import {createWorkspace, type CrateFiles} from '${core.name}'
const files: CrateFiles = new Map([['x','value']]); const selectedPath: string | null = createWorkspace(files).resolveFile('./x'); void selectedPath
` : `
import {validateCrate, type CrateFiles} from '${validator.name}'
import {ValidationSession} from '${validator.name}/browser'
import type {ValidationRequest} from '${validator.name}/worker'
const files: CrateFiles = new Map([['x','value']]); void validateCrate(files)
const request: ValidationRequest = {session:'consumer',revision:1,id:1,files}; void request
const session = new ValidationSession(); session.select(files); session.dispose()
`
    await writeFile(resolve(directory, 'consumer.ts'), types)
    await mkdir(resolve(directory, 'browser-types'), {recursive: true})
    run('node', [compiler, ...sharedTypes, '--lib', 'ES2022,DOM,DOM.Iterable', '--typeRoots', resolve(directory, 'browser-types'), 'consumer.ts'], directory)
    if (name === 'validator') await prepareApps(directory)
  }

  const proof = await consumerProof()
  await writeFile(proofPath, JSON.stringify(proof, null, 2) + '\n')
  return {prepared: true, strict_node_typescript: true, strict_browser_typescript: true, ...proof}
}

async function prepareApps(directory) {
  await writeFile(resolve(directory, 'app.mjs'), `
import {ValidationSession} from '${validator.name}/browser'
import {validateCrate} from '${validator.name}'
window.inline = (files, options = {}) => validateCrate(new Map(files), options)
window.validate = (files, validationOptions = {}) => new Promise((resolve,reject) => {
  const workerOptions = location.pathname.includes('bundled') ? {workerFactory:()=>new Worker(new URL('./worker.js',import.meta.url),{type:'module'})} : {}
  const session = new ValidationSession({...workerOptions, debounceMs:0, options:validationOptions})
  const timeout = setTimeout(()=>{session.dispose();reject(new Error('Installed worker timed out'))},60000)
  session.subscribe(state=>{if(['valid','invalid','incomplete'].includes(state.state)) {
    const result={state:state.state, eligible:state.eligible, handed:state.eligible?[...session.continue().files]:null}
    clearTimeout(timeout);session.dispose();resolve(result)
  }})
  session.select(new Map(files))
})
`)
  await writeFile(resolve(directory, 'index.html'), `<!doctype html><html><head><script type="importmap">${JSON.stringify({imports:{
    [core.name]: '/node_modules/' + core.name + '/dist/index.js',
    [validator.name]: '/node_modules/' + validator.name + '/dist/index.js',
    [validator.name + '/browser']: '/node_modules/' + validator.name + '/dist/browser.js'}})}</script></head><body><script type="module" src="/app.mjs"></script></body></html>`)
  await build({absWorkingDir: directory, entryPoints: ['app.mjs'], outfile: 'bundle.js', bundle: true, platform: 'browser', format: 'esm', target: 'es2022'})
  await cp(resolve(directory, 'node_modules', validator.name, 'dist/worker.js'), resolve(directory, 'worker.js'))
  await writeFile(resolve(directory, 'bundled.html'), '<!doctype html><html><body><script type="module" src="/bundle.js"></script></body></html>')
}

async function nodeChecks(nodeVersions) {
  const proof = await verifyPrepared()
  const module = new URL(proof.consumers.find(item => item.name === 'validator').packages.find(item => item.name === validator.name).entry, new URL('../../', import.meta.url)).href
  for (const version of nodeVersions) {
    const direct = mode === '--node'
    const execute = (script, extraEnv = {}) => direct
      ? run(process.execPath, [script], root, extraEnv)
      : run('npm', ['exec', '--yes', '--package=node@' + version, '--', 'node', script], root, extraEnv)
    if (direct) assert.equal(process.versions.node, version)
    else assert.equal(run('npm', ['exec', '--yes', '--package=node@' + version, '--', 'node', '--version'], root).trim(), 'v' + version)
    for (const name of ['core', 'validator']) execute(resolve(root, 'artifacts/consumers', name, 'consumer.mjs'))
  }
  const runNode = (version, arguments_, env) => mode === '--node'
    ? run(process.execPath, arguments_, root, env)
    : run('npm', ['exec', '--yes', '--package=node@' + version, '--', 'node', ...arguments_], root, env)
  const installedCorpus = []
  for (const version of nodeVersions) {
    const parity = runNode(version, ['tests/parity/run.mjs', '--snapshot'], {BIJUX_VALIDATOR_MODULE: module})
    const receipt = JSON.parse(parity)
    assert.equal(receipt.node_version, version)
    assert.equal(receipt.distribution, 'installed')
    assert.equal(receipt.failed, 0)
    assert.equal(receipt.passed, receipt.total)
    const nativeInputs = JSON.parse(runNode(version, ['tests/package/native-inputs.mjs'], {BIJUX_VALIDATOR_MODULE: module}))
    assert.equal(nativeInputs.node, version)
    assert.equal(nativeInputs.passed, 4)
    const upstreamDefects = JSON.parse(runNode(version, ['tests/reference/upstream-defects/run.mjs'], {BIJUX_VALIDATOR_MODULE: module}))
    assert.equal(upstreamDefects.distribution, 'installed')
    assert.equal(upstreamDefects.node_version, version)
    assert.equal(upstreamDefects.imported_module, module)
    assert.equal(upstreamDefects.cases, 50)
    assert.equal(upstreamDefects.approved_differences, 28)
    const numericIdentity = JSON.parse(runNode(version, ['tests/reference/manifest-numeric-identity/run.mjs'], {BIJUX_VALIDATOR_MODULE: module}))
    assert.equal(numericIdentity.distribution, 'installed')
    assert.equal(numericIdentity.node_version, version)
    assert.equal(numericIdentity.imported_module, module)
    assert.equal(numericIdentity.cases, 11)
    assert.equal(numericIdentity.platform_dependent, 3)
    const line = version.split('.')[0]
    await writeFile(resolve(root, 'artifacts/logs/installed-parity.log'), parity)
    await writeFile(resolve(root, `artifacts/logs/installed-parity-node${line}.log`), parity)
    await writeFile(resolve(root, `artifacts/reports/installed-snapshot-parity-node${line}.json`), JSON.stringify(receipt, null, 2) + '\n')
    installedCorpus.push({node_version: version, total: receipt.total, passed: receipt.passed,
      corpus_sha256: receipt.corpus_sha256, imported_module: receipt.imported_module,
      native_inputs: nativeInputs, upstream_defects: upstreamDefects, numeric_identity: numericIdentity})
  }
  return installedCorpus
}

async function installedBrowserChecks({corpora = true} = {}) {
  await verifyPrepared()
  if (corpora) {
    const browserParity = run('node', ['tests/browser/parity.mjs'], root, {
      BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
    })
    const continuationParity = JSON.parse(run('node', ['tests/browser/continuation-parity.mjs'], root, {
      BIJUX_BROWSER_CORE_PATH: installedCorePath,
      BIJUX_BROWSER_SESSION_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/browser.js',
      BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
    }))
    reports.push({consumer: 'validator', continuation_parity: continuationParity})
    await writeFile(resolve(root, 'artifacts/logs/installed-browser-parity.log'), browserParity)
  }
  const upstreamDefects = JSON.parse(run('node', ['tests/browser/upstream-defects.mjs'], root, {
    BIJUX_BROWSER_CORE_PATH: installedCorePath,
    BIJUX_BROWSER_SESSION_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/browser.js',
    BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
  }))
  reports.push({consumer: 'validator', upstream_defects: upstreamDefects})
  const numericIdentity = JSON.parse(run('node', ['tests/browser/manifest/numeric-identity.mjs'], root, {
    BIJUX_BROWSER_CORE_PATH: installedCorePath,
    BIJUX_BROWSER_SESSION_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/browser.js',
    BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
  }))
  reports.push({consumer: 'validator', numeric_identity: numericIdentity})
  const termination = JSON.parse(run('node', ['tests/browser/session/termination.mjs'], root, {
    BIJUX_BROWSER_SESSION_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/browser.js',
    BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
    BIJUX_BROWSER_CORE_PATH: installedCorePath,
  }))
  reports.push({consumer: 'validator', termination_ownership: termination})
  const lifecycleLog = run('node', ['tests/browser/races.mjs'], root, {
    BIJUX_BROWSER_SESSION_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/browser.js',
    BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
    BIJUX_BROWSER_CORE_PATH: installedCorePath,
  })
  await writeFile(resolve(root, 'artifacts/logs/installed-browser-races.log'), lifecycleLog)
  const lifecycle = JSON.parse(await readFile(resolve(root, 'artifacts/reports/installed-browser-races.json')))
  assert.equal(lifecycle.corePath, installedCorePath)
  assert.equal(lifecycle.distribution, 'installed')
  reports.push({consumer: 'validator', installed_session_lifecycle: lifecycle})

  const nativeInputs = JSON.parse(run('node', ['tests/browser/native-file-values.mjs'], root, {
    BIJUX_BROWSER_SESSION_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/browser.js',
    BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
    BIJUX_BROWSER_VALIDATOR_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/index.js',
    BIJUX_BROWSER_CORE_PATH: '/artifacts/consumers/validator/node_modules/' + core.name + '/dist/index.js',
  }))
  reports.push({consumer: 'validator', native_inputs: nativeInputs})
  const textInputs = JSON.parse(run('node', ['tests/browser/text-file-values.mjs'], root, {
    BIJUX_BROWSER_SESSION_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/browser.js',
    BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
    BIJUX_BROWSER_VALIDATOR_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/index.js',
    BIJUX_BROWSER_CORE_PATH: installedCorePath,
  }))
  reports.push({consumer: 'validator', text_inputs: textInputs})
  const colonSelection = JSON.parse(run('node', ['tests/browser/selected-colon-paths.mjs'], root, {
    BIJUX_BROWSER_SESSION_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/browser.js',
    BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
    BIJUX_BROWSER_VALIDATOR_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/index.js',
    BIJUX_BROWSER_CORE_PATH: installedCorePath,
  }))
  reports.push({consumer: 'validator', native_colon_selection: colonSelection})
  const rootIdentity = JSON.parse(run('node', ['tests/browser/root-identity.mjs'], root, {
    BIJUX_BROWSER_SESSION_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/browser.js',
    BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
    BIJUX_BROWSER_VALIDATOR_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/index.js',
    BIJUX_BROWSER_CORE_PATH: installedCorePath,
  }))
  reports.push({consumer: 'validator', root_identity: rootIdentity})
}

async function browserApps() {
  await verifyPrepared()
  const directory = resolve(root, 'artifacts/consumers/validator')
  const fixture = resolve(root, 'tests/parity/fixtures/test_minimal_valid_ro_crate')
  const files = await Promise.all(['ro-crate-metadata.json', 'file_list.tsv'].map(async name => [name, await readFile(resolve(fixture, name), 'utf8')]))
  const invalid = JSON.parse(files[0][1]); delete invalid['@graph'].find(item => item['@id'] === './').name
  const invalidFiles = [[files[0][0], JSON.stringify(invalid)], files[1]]
  const host = await serve(directory)
  try {
    for (const [engineName, engine] of selectedEngines({chromium, firefox, webkit})) {
      const browser = await engine.launch({headless: true})
      try {
        const context = await browser.newContext({serviceWorkers: 'block'})
        const unexpected = []
        await context.route('**/*', route => {
          const url = new URL(route.request().url())
          if (url.origin !== host.origin) {unexpected.push(url.href); return route.abort()}
          return route.continue()
        })
        for (const pageName of ['index.html', 'bundled.html']) {
          const page = await context.newPage()
          await page.goto(host.origin + '/' + pageName)
          await page.waitForFunction(() => typeof window.validate === 'function')
          const success = await page.evaluate(files => window.validate(files), files)
          assert.equal(success.state, 'valid')
          assert.equal(success.eligible, true)
          assert.deepEqual(success.handed, files)
          const failure = await page.evaluate(files => window.validate(files), invalidFiles)
          assert.equal(failure.state, 'invalid')
          assert.equal(failure.eligible, false)
          assert.equal((await page.evaluate(files => window.inline(files), files)).status, 'valid')
          assert.equal((await page.evaluate(files => window.inline(files), invalidFiles)).status, 'invalid')
          const propagation = await page.evaluate(async files => {
            const selected = new Map(files)
            const url = 'https://example.org/contexts/propagation'
            const document = JSON.parse(selected.get('ro-crate-metadata.json'))
            document['@context'].push(url)
            selected.set('ro-crate-metadata.json', JSON.stringify(document))
            const rows = []
            for (const serialized of [false, true]) for (const propagate of [false, true]) {
              const context = {'@context': {'@propagate': propagate}}
              const options = {contexts: new Map([[url, serialized ? JSON.stringify(context) : context]])}
              const inline = await window.inline([...selected], options)
              const worker = await window.validate([...selected], options)
              rows.push({serialized, propagate, inline: inline.status, worker: worker.state,
                eligible: worker.eligible, empty_report: inline.report.highest_error_level === null})
            }
            return rows
          }, files)
          for (const item of propagation) {
            assert.equal(item.inline, 'valid')
            assert.equal(item.worker, 'valid')
            assert.equal(item.eligible, true)
            assert.equal(item.empty_report, true)
          }
          const ownership = await page.evaluate(async files => {
            const path = 'ro-crate-metadata.json'
            const original = files.find(([name]) => name === path)[1]
            const results = []
            for (const kind of ['ArrayBuffer', 'Blob']) {
              let input, callerBytes
              if (kind === 'ArrayBuffer') {
                class CallerBuffer extends ArrayBuffer {slice() {return this}}
                input = new CallerBuffer(new TextEncoder().encode(original).byteLength)
                callerBytes = new Uint8Array(input)
                callerBytes.set(new TextEncoder().encode(original))
              } else {
                class CallerBlob extends Blob {
                  async arrayBuffer() {return new TextEncoder().encode('{}').buffer}
                  async text() {return '{}'}
                }
                input = new CallerBlob([original])
              }
              const outcome = await window.validate(files.map(([name, value]) => [name, name === path ? input : value]))
              if (callerBytes) {callerBytes.fill(32); callerBytes.set(new TextEncoder().encode('{}'))}
              const handed = outcome.handed?.find(([name]) => name === path)?.[1]
              const text = handed instanceof Blob ? await handed.text() : new TextDecoder().decode(handed)
              const recheck = await window.inline(outcome.handed)
              results.push({kind, state: outcome.state, eligible: outcome.eligible,
                exact_bytes: text === original, revalidated: recheck.status})
            }
            return results
          }, files)
          assert.equal(ownership.length, 2)
          for (const item of ownership) {
            assert.equal(item.state, 'valid')
            assert.equal(item.eligible, true)
            assert.equal(item.exact_bytes, true)
            assert.equal(item.revalidated, 'valid')
          }
          reports.push({consumer: 'validator', engine: engineName, version: browser.version(), page: pageName,
            public_inline_api: true, installed_module_worker: true, exact_byte_handoff: true, context_propagation: propagation, caller_owned_inputs: ownership})
          await page.close()
        }
        assert.deepEqual(unexpected, [])
      } finally {await browser.close()}
    }
  } finally {await host.close()}

}

if (mode === '--all' || mode === '--prepare') reports.push(await prepare())
if (mode === '--verify') reports.push(await verifyPrepared())
if (mode === '--all' || mode === '--node') {
  const selected = process.env.BIJUX_TEST_NODE ?? process.versions.node
  if (mode === '--node') assert.ok(pinnedNodes.includes(selected), 'Unsupported package test Node version')
  reports.push({consumer: 'validator', installed_corpus: await nodeChecks(mode === '--all' ? pinnedNodes : [selected])})
}
if (mode === '--all' || mode === '--browser-guards') await installedBrowserChecks({corpora: mode === '--all'})
if (mode === '--all' || mode === '--browser-apps') await browserApps()
const suffix = mode === '--all' ? '' : ['--browser-apps', '--browser-guards'].includes(mode) ? '-' + mode.slice(2) + '-' + (process.env.BIJUX_TEST_ENGINE ?? 'all') : '-' + mode.slice(2) + (mode === '--node' ? '-' + process.versions.node.split('.')[0] : '')
await mkdir(resolve(root, 'artifacts/reports'), {recursive: true})
await writeFile(resolve(root, `artifacts/reports/package-consumers${suffix}.json`), JSON.stringify(reports, null, 2) + '\n')
console.log(JSON.stringify(reports, null, 2))

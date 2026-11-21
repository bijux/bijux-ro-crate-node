import assert from 'node:assert/strict'
import {readFile, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium, firefox, webkit} from 'playwright'
import {serve} from '../../../scripts/http/server.mjs'
import {selectedEngines} from '../../support/selection.mjs'
import type {CrateValue, ValidationOptions, ValidationResult} from '../../../packages/validator/src/index.js'
import {parseJson, lifecycleReceipt, withoutRootName} from '../harness/receipts.mjs'
import type {QualificationContext} from './contracts.mjs'

type BrowserFiles = Array<[string, CrateValue]>
declare global { interface Window { inline(files: BrowserFiles, options?: ValidationOptions): Promise<ValidationResult>; validate(files: BrowserFiles, options?: ValidationOptions): Promise<{state: string; eligible: boolean; handed: BrowserFiles | null}> } }

export function browserQualification({root, core, validator, run, verifyPrepared, installedCorePath, installedPaths, reports}: QualificationContext) {
  async function installedBrowserChecks({corpora = true} = {}) {
    await verifyPrepared()
    if (corpora) {
      const browserParity = run('node', ['tests/browser/parity.mjs'], root, {
        BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
      })
      const continuationParity = parseJson(run('node', ['tests/browser/continuation-parity.mjs'], root, {
        BIJUX_BROWSER_CORE_PATH: installedCorePath,
        BIJUX_BROWSER_SESSION_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/browser.js',
        BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
      }))
      reports.push({consumer: 'validator', continuation_parity: continuationParity})
      await writeFile(resolve(root, 'artifacts/logs/installed-browser-parity.log'), browserParity)
      const literalGrammar = parseJson(run('node', ['tests/browser/metadata/literal-grammar.mjs'], root, installedPaths))
      reports.push({consumer: 'validator', literal_grammar: literalGrammar})
      const jsonldProcessing = parseJson(run('node', ['tests/browser/metadata/jsonld-processing.mjs'], root, installedPaths))
      reports.push({consumer: 'validator', jsonld_processing: jsonldProcessing})
      const inferredCollections = parseJson(run('node', ['tests/browser/profile/inferred-collections.mjs'], root, installedPaths))
      reports.push({consumer: 'validator', inferred_collections: inferredCollections})
      const collectionDiagnostics = parseJson(run('node', ['tests/browser/profile/collection-diagnostics.mjs'], root, installedPaths))
      reports.push({consumer: 'validator', collection_diagnostics: collectionDiagnostics})
      run('node', ['tests/reference/html-tree-building/dom-proof.mjs'], root)
    }
    const upstreamDefects = parseJson(run('node', ['tests/browser/upstream-defects.mjs'], root, {
      BIJUX_BROWSER_CORE_PATH: installedCorePath,
      BIJUX_BROWSER_SESSION_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/browser.js',
      BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
    }))
    reports.push({consumer: 'validator', upstream_defects: upstreamDefects})
    const reservedTypes = parseJson(run('node', ['tests/browser/metadata/reserved-types.mjs'], root, installedPaths))
    reports.push({consumer: 'validator', reserved_types: reservedTypes})
    const modelTypePrefixes = parseJson(run('node', ['tests/browser/metadata/model-type-prefixes.mjs'], root, installedPaths))
    reports.push({consumer: 'validator', model_type_prefixes: modelTypePrefixes})
    const numericIdentity = parseJson(run('node', ['tests/browser/manifest/numeric-identity.mjs'], root, {
      BIJUX_BROWSER_CORE_PATH: installedCorePath,
      BIJUX_BROWSER_SESSION_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/browser.js',
      BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
    }))
    reports.push({consumer: 'validator', numeric_identity: numericIdentity})
    const termination = parseJson(run('node', ['tests/browser/session/termination.mjs'], root, {
      BIJUX_BROWSER_SESSION_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/browser.js',
      BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
      BIJUX_BROWSER_CORE_PATH: installedCorePath,
    }))
    reports.push({consumer: 'validator', termination_ownership: termination})
    const completion = parseJson(run('node', ['tests/browser/session/completion.mjs'], root, installedPaths))
    reports.push({consumer: 'validator', session_completion: completion})
    const lifecycleLog = run('node', ['tests/browser/races.mjs'], root, {
      BIJUX_BROWSER_SESSION_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/browser.js',
      BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
      BIJUX_BROWSER_CORE_PATH: installedCorePath,
    })
    await writeFile(resolve(root, 'artifacts/logs/installed-browser-races.log'), lifecycleLog)
    const lifecycle = lifecycleReceipt(parseJson(await readFile(resolve(root, 'artifacts/reports/installed-browser-races.json'), 'utf8')))
    assert.equal(lifecycle.corePath, installedCorePath)
    assert.equal(lifecycle.distribution, 'installed')
    reports.push({consumer: 'validator', installed_session_lifecycle: lifecycle})

    const nativeInputs = parseJson(run('node', ['tests/browser/native-file-values.mjs'], root, {
      BIJUX_BROWSER_SESSION_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/browser.js',
      BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
      BIJUX_BROWSER_VALIDATOR_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/index.js',
      BIJUX_BROWSER_CORE_PATH: '/artifacts/consumers/validator/node_modules/' + core.name + '/dist/index.js',
    }))
    reports.push({consumer: 'validator', native_inputs: nativeInputs})
    const textInputs = parseJson(run('node', ['tests/browser/text-file-values.mjs'], root, {
      BIJUX_BROWSER_SESSION_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/browser.js',
      BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
      BIJUX_BROWSER_VALIDATOR_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/index.js',
      BIJUX_BROWSER_CORE_PATH: installedCorePath,
    }))
    reports.push({consumer: 'validator', text_inputs: textInputs})
    const pathInputs = parseJson(run('node', ['tests/browser/file-path-ownership.mjs'], root, {
      BIJUX_BROWSER_SESSION_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/browser.js',
      BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
      BIJUX_BROWSER_VALIDATOR_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/index.js',
      BIJUX_BROWSER_CORE_PATH: installedCorePath,
    }))
    reports.push({consumer: 'validator', path_inputs: pathInputs})
    const colonSelection = parseJson(run('node', ['tests/browser/selected-colon-paths.mjs'], root, {
      BIJUX_BROWSER_SESSION_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/browser.js',
      BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
      BIJUX_BROWSER_VALIDATOR_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/index.js',
      BIJUX_BROWSER_CORE_PATH: installedCorePath,
    }))
    reports.push({consumer: 'validator', native_colon_selection: colonSelection})
    const rootIdentity = parseJson(run('node', ['tests/browser/root-identity.mjs'], root, {
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
    const files = await Promise.all(['ro-crate-metadata.json', 'file_list.tsv'].map(async (name): Promise<[string, string]> => [name, await readFile(resolve(fixture, name), 'utf8')]))
    const invalid = withoutRootName(files[0][1])
    const invalidFiles: Array<[string, string]> = [[files[0][0], JSON.stringify(invalid)], files[1]]
    const host = await serve(directory)
    try {
      for (const [engineName, engine] of selectedEngines({chromium, firefox, webkit})) {
        const browser = await engine.launch({headless: true})
        try {
          const context = await browser.newContext({serviceWorkers: 'block'})
          const unexpected: string[] = []
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
              const metadata = selected.get('ro-crate-metadata.json')
              if (metadata === undefined) throw new Error('Metadata is missing')
              const document: unknown = JSON.parse(metadata)
              if (!document || typeof document !== 'object' || !('@context' in document) || !Array.isArray(document['@context'])) throw new TypeError('Expected metadata context')
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
              const entry = files.find(([name]) => name === path)
              if (!entry) throw new Error('Metadata is missing')
              const original = entry[1]
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
                if (!(handed instanceof Blob) && !(handed instanceof ArrayBuffer) && !ArrayBuffer.isView(handed)) throw new TypeError('Expected handed bytes')
                const text = handed instanceof Blob ? await handed.text() : new TextDecoder().decode(handed)
                if (!outcome.handed) throw new Error('Expected approved files')
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


  return {installedBrowserChecks, browserApps}
}

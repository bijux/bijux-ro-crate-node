// Generated from tests/package/validator.mts by npm run generate:runtime; do not edit.
import { readFile, writeFile, cp, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from 'playwright';
import { serve } from '../../scripts/http/server.mjs';
import { selectedEngines } from '../support/selection.mjs';
import { parseJson, snapshotReceipt, nodeReceipt, nativeReceipt, numericReceipt, lifecycleReceipt, withoutRootName } from './harness/receipts.mjs';
export async function validatorScenario(validator, root) {
    const contextFiles = await Promise.all(['ro-crate-metadata.json', 'file_list.tsv']
        .map(async (path) => [path, await readFile(resolve(root, 'tests/parity/fixtures/test_minimal_valid_ro_crate', path), 'utf8')]));
    return { code: `
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
`, nodeTypes: `
import {validateCrate, type CrateFiles} from '${validator.name}'
import type {ValidationRequest} from '${validator.name}/worker'
const files: CrateFiles = new Map([['x', 'value']]); void validateCrate(files)
const request: ValidationRequest = {session: 'node', revision: 1, id: 1, files}; void request
`, browserTypes: `
import {validateCrate, type CrateFiles} from '${validator.name}'
import {ValidationSession} from '${validator.name}/browser'
import type {ValidationRequest} from '${validator.name}/worker'
const files: CrateFiles = new Map([['x','value']]); void validateCrate(files)
const request: ValidationRequest = {session:'consumer',revision:1,id:1,files}; void request
const session = new ValidationSession(); session.select(files); session.dispose()
` };
}
export async function prepareApps(directory, core, validator) {
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
`);
    await writeFile(resolve(directory, 'index.html'), `<!doctype html><html><head><script type="importmap">${JSON.stringify({ imports: {
            [core.name]: '/node_modules/' + core.name + '/dist/index.js',
            [validator.name]: '/node_modules/' + validator.name + '/dist/index.js',
            [validator.name + '/browser']: '/node_modules/' + validator.name + '/dist/browser.js'
        } })}</script></head><body><script type="module" src="/app.mjs"></script></body></html>`);
    const bundle = await build({ absWorkingDir: directory, entryPoints: ['app.mjs'], outfile: 'bundle.js', bundle: true, platform: 'browser', format: 'esm', target: 'es2022', metafile: true });
    const root = await realpath(directory);
    for (const input of Object.keys(bundle.metafile.inputs)) {
        const path = await realpath(resolve(directory, input));
        const local = relative(root, path);
        assert.ok(local !== '..' && !local.startsWith('..' + sep) && !isAbsolute(local), 'Browser bundle input is outside installed consumer: ' + path);
    }
    await cp(resolve(directory, 'node_modules', validator.name, 'dist/worker.js'), resolve(directory, 'worker.js'));
    await writeFile(resolve(directory, 'bundled.html'), '<!doctype html><html><body><script type="module" src="/bundle.js"></script></body></html>');
}
export function validatorQualification({ root, core, validator, run, verifyPrepared, installedCorePath, installedPaths, mode, reports }) {
    async function nodeChecks(nodeVersions) {
        const proof = await verifyPrepared();
        const validatorConsumer = proof.consumers.find(item => item.name === 'validator');
        assert.ok(validatorConsumer);
        const validatorEntry = validatorConsumer.packages.find(item => item.name === validator.name);
        assert.ok(validatorEntry);
        const module = new URL(validatorEntry.entry, new URL('../../', import.meta.url)).href;
        const runNode = (version, arguments_, env) => mode === '--node'
            ? run(process.execPath, arguments_, root, env)
            : run('npm', ['exec', '--yes', '--package=node@' + version, '--', 'node', ...arguments_], root, env);
        const installedCorpus = [];
        for (const version of nodeVersions) {
            const parity = runNode(version, ['tests/parity/snapshot-partitions.mjs'], { BIJUX_VALIDATOR_MODULE: module });
            const receipt = snapshotReceipt(parseJson(parity));
            assert.equal(receipt.node_version, version);
            assert.equal(receipt.distribution, 'installed');
            assert.equal(receipt.failed, 0);
            assert.equal(receipt.passed, receipt.total);
            assert.equal(receipt.reference_kind, 'qualified-main');
            assert.equal(receipt.qualified_collection_cases, 151);
            assert.equal(receipt.qualified_collection_passed, 151);
            assert.equal(receipt.ordinary_exact_cases, receipt.total - 151);
            assert.equal(receipt.ordinary_exact_passed, receipt.total - 151);
            const nativeInputs = nativeReceipt(parseJson(runNode(version, ['tests/package/native-inputs.mjs'], { BIJUX_VALIDATOR_MODULE: module })));
            assert.equal(nativeInputs.node, version);
            assert.equal(nativeInputs.passed, 4);
            const upstreamDefects = nodeReceipt(parseJson(runNode(version, ['tests/reference/upstream-defects/run.mjs'], { BIJUX_VALIDATOR_MODULE: module })));
            assert.equal(upstreamDefects.distribution, 'installed');
            assert.equal(upstreamDefects.node_version, version);
            assert.equal(upstreamDefects.imported_module, module);
            assert.equal(upstreamDefects.cases, 123);
            assert.equal(upstreamDefects.approved_differences, 47);
            const reservedTypes = nodeReceipt(parseJson(runNode(version, ['tests/reference/reserved-type-identifiers/observers/run.mjs'], { BIJUX_VALIDATOR_MODULE: module })));
            assert.equal(reservedTypes.distribution, 'installed');
            assert.equal(reservedTypes.node_version, version);
            assert.equal(reservedTypes.imported_module, module);
            assert.equal(reservedTypes.cases, 6);
            assert.equal(reservedTypes.approved_differences, 2);
            assert.deepEqual(reservedTypes.outcomes, { valid: 0, invalid: 6, incomplete: 0 });
            const modelTypePrefixes = nodeReceipt(parseJson(runNode(version, ['tests/reference/model-type-prefixes/run.mjs'], { BIJUX_VALIDATOR_MODULE: module })));
            assert.equal(modelTypePrefixes.distribution, 'installed');
            assert.equal(modelTypePrefixes.node_version, version);
            assert.equal(modelTypePrefixes.imported_module, module);
            assert.equal(modelTypePrefixes.cases, 20);
            assert.equal(modelTypePrefixes.approved_differences, 0);
            assert.deepEqual(modelTypePrefixes.outcomes, { valid: 5, invalid: 15, incomplete: 0 });
            const literalGrammar = nodeReceipt(parseJson(runNode(version, ['tests/reference/literal-grammar/run.mjs'], { BIJUX_VALIDATOR_MODULE: module })));
            assert.equal(literalGrammar.distribution, 'installed');
            assert.equal(literalGrammar.node_version, version);
            assert.equal(literalGrammar.imported_module, module);
            assert.equal(literalGrammar.cases, 62);
            assert.equal(literalGrammar.approved_differences, 18);
            const jsonldProcessing = nodeReceipt(parseJson(runNode(version, ['tests/reference/jsonld-processing/run.mjs'], { BIJUX_VALIDATOR_MODULE: module })));
            assert.equal(jsonldProcessing.distribution, 'installed');
            assert.equal(jsonldProcessing.node_version, version);
            assert.equal(jsonldProcessing.imported_module, module);
            assert.equal(jsonldProcessing.cases, 80);
            assert.equal(jsonldProcessing.approved_differences, 72);
            assert.deepEqual(jsonldProcessing.outcomes, { valid: 4, invalid: 37, incomplete: 39 });
            const inferredCollections = nodeReceipt(parseJson(runNode(version, ['tests/reference/inferred-collections/run.mjs'], { BIJUX_VALIDATOR_MODULE: module })));
            assert.equal(inferredCollections.distribution, 'installed');
            assert.equal(inferredCollections.node_version, version);
            assert.equal(inferredCollections.imported_module, module);
            assert.equal(inferredCollections.cases, 138);
            assert.equal(inferredCollections.approved_differences, 41);
            assert.equal(inferredCollections.input_limits, 0);
            assert.deepEqual(inferredCollections.outcomes, { valid: 96, invalid: 42, incomplete: 0 });
            const collectionDiagnostics = nodeReceipt(parseJson(runNode(version, ['tests/reference/collection-diagnostics/run.mjs'], { BIJUX_VALIDATOR_MODULE: module })));
            assert.equal(collectionDiagnostics.distribution, 'installed');
            assert.equal(collectionDiagnostics.node_version, version);
            assert.equal(collectionDiagnostics.imported_module, module);
            assert.equal(collectionDiagnostics.cases, 15);
            assert.equal(collectionDiagnostics.approved_differences, 3);
            assert.deepEqual(collectionDiagnostics.outcomes, { valid: 3, invalid: 12, incomplete: 0 });
            const numericIdentity = numericReceipt(parseJson(runNode(version, ['tests/reference/manifest-numeric-identity/run.mjs'], { BIJUX_VALIDATOR_MODULE: module })));
            assert.equal(numericIdentity.distribution, 'installed');
            assert.equal(numericIdentity.node_version, version);
            assert.equal(numericIdentity.imported_module, module);
            assert.equal(numericIdentity.cases, 11);
            assert.equal(numericIdentity.platform_dependent, 3);
            const line = version.split('.')[0];
            await writeFile(resolve(root, 'artifacts/logs/installed-parity.log'), parity);
            await writeFile(resolve(root, `artifacts/logs/installed-parity-node${line}.log`), parity);
            await writeFile(resolve(root, `artifacts/reports/installed-snapshot-parity-node${line}.json`), JSON.stringify(receipt, null, 2) + '\n');
            installedCorpus.push({ node_version: version, total: receipt.total, passed: receipt.passed,
                reference_kind: receipt.reference_kind, ordinary_exact_passed: receipt.ordinary_exact_passed,
                qualified_collection_passed: receipt.qualified_collection_passed,
                corpus_sha256: receipt.corpus_sha256, imported_module: receipt.imported_module,
                native_inputs: nativeInputs, upstream_defects: upstreamDefects, reserved_types: reservedTypes, model_type_prefixes: modelTypePrefixes, literal_grammar: literalGrammar, jsonld_processing: jsonldProcessing,
                inferred_collections: inferredCollections, collection_diagnostics: collectionDiagnostics, numeric_identity: numericIdentity });
        }
        return installedCorpus;
    }
    async function installedBrowserChecks({ corpora = true } = {}) {
        await verifyPrepared();
        if (corpora) {
            const browserParity = run('node', ['tests/browser/parity.mjs'], root, {
                BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
            });
            const continuationParity = parseJson(run('node', ['tests/browser/continuation-parity.mjs'], root, {
                BIJUX_BROWSER_CORE_PATH: installedCorePath,
                BIJUX_BROWSER_SESSION_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/browser.js',
                BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
            }));
            reports.push({ consumer: 'validator', continuation_parity: continuationParity });
            await writeFile(resolve(root, 'artifacts/logs/installed-browser-parity.log'), browserParity);
            const literalGrammar = parseJson(run('node', ['tests/browser/metadata/literal-grammar.mjs'], root, installedPaths));
            reports.push({ consumer: 'validator', literal_grammar: literalGrammar });
            const jsonldProcessing = parseJson(run('node', ['tests/browser/metadata/jsonld-processing.mjs'], root, installedPaths));
            reports.push({ consumer: 'validator', jsonld_processing: jsonldProcessing });
            const inferredCollections = parseJson(run('node', ['tests/browser/profile/inferred-collections.mjs'], root, installedPaths));
            reports.push({ consumer: 'validator', inferred_collections: inferredCollections });
            const collectionDiagnostics = parseJson(run('node', ['tests/browser/profile/collection-diagnostics.mjs'], root, installedPaths));
            reports.push({ consumer: 'validator', collection_diagnostics: collectionDiagnostics });
            run('node', ['tests/reference/html-tree-building/dom-proof.mjs'], root);
        }
        const upstreamDefects = parseJson(run('node', ['tests/browser/upstream-defects.mjs'], root, {
            BIJUX_BROWSER_CORE_PATH: installedCorePath,
            BIJUX_BROWSER_SESSION_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/browser.js',
            BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
        }));
        reports.push({ consumer: 'validator', upstream_defects: upstreamDefects });
        const reservedTypes = parseJson(run('node', ['tests/browser/metadata/reserved-types.mjs'], root, installedPaths));
        reports.push({ consumer: 'validator', reserved_types: reservedTypes });
        const modelTypePrefixes = parseJson(run('node', ['tests/browser/metadata/model-type-prefixes.mjs'], root, installedPaths));
        reports.push({ consumer: 'validator', model_type_prefixes: modelTypePrefixes });
        const numericIdentity = parseJson(run('node', ['tests/browser/manifest/numeric-identity.mjs'], root, {
            BIJUX_BROWSER_CORE_PATH: installedCorePath,
            BIJUX_BROWSER_SESSION_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/browser.js',
            BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
        }));
        reports.push({ consumer: 'validator', numeric_identity: numericIdentity });
        const termination = parseJson(run('node', ['tests/browser/session/termination.mjs'], root, {
            BIJUX_BROWSER_SESSION_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/browser.js',
            BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
            BIJUX_BROWSER_CORE_PATH: installedCorePath,
        }));
        reports.push({ consumer: 'validator', termination_ownership: termination });
        const completion = parseJson(run('node', ['tests/browser/session/completion.mjs'], root, installedPaths));
        reports.push({ consumer: 'validator', session_completion: completion });
        const lifecycleLog = run('node', ['tests/browser/races.mjs'], root, {
            BIJUX_BROWSER_SESSION_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/browser.js',
            BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
            BIJUX_BROWSER_CORE_PATH: installedCorePath,
        });
        await writeFile(resolve(root, 'artifacts/logs/installed-browser-races.log'), lifecycleLog);
        const lifecycle = lifecycleReceipt(parseJson(await readFile(resolve(root, 'artifacts/reports/installed-browser-races.json'), 'utf8')));
        assert.equal(lifecycle.corePath, installedCorePath);
        assert.equal(lifecycle.distribution, 'installed');
        reports.push({ consumer: 'validator', installed_session_lifecycle: lifecycle });
        const nativeInputs = parseJson(run('node', ['tests/browser/native-file-values.mjs'], root, {
            BIJUX_BROWSER_SESSION_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/browser.js',
            BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
            BIJUX_BROWSER_VALIDATOR_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/index.js',
            BIJUX_BROWSER_CORE_PATH: '/artifacts/consumers/validator/node_modules/' + core.name + '/dist/index.js',
        }));
        reports.push({ consumer: 'validator', native_inputs: nativeInputs });
        const textInputs = parseJson(run('node', ['tests/browser/text-file-values.mjs'], root, {
            BIJUX_BROWSER_SESSION_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/browser.js',
            BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
            BIJUX_BROWSER_VALIDATOR_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/index.js',
            BIJUX_BROWSER_CORE_PATH: installedCorePath,
        }));
        reports.push({ consumer: 'validator', text_inputs: textInputs });
        const pathInputs = parseJson(run('node', ['tests/browser/file-path-ownership.mjs'], root, {
            BIJUX_BROWSER_SESSION_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/browser.js',
            BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
            BIJUX_BROWSER_VALIDATOR_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/index.js',
            BIJUX_BROWSER_CORE_PATH: installedCorePath,
        }));
        reports.push({ consumer: 'validator', path_inputs: pathInputs });
        const colonSelection = parseJson(run('node', ['tests/browser/selected-colon-paths.mjs'], root, {
            BIJUX_BROWSER_SESSION_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/browser.js',
            BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
            BIJUX_BROWSER_VALIDATOR_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/index.js',
            BIJUX_BROWSER_CORE_PATH: installedCorePath,
        }));
        reports.push({ consumer: 'validator', native_colon_selection: colonSelection });
        const rootIdentity = parseJson(run('node', ['tests/browser/root-identity.mjs'], root, {
            BIJUX_BROWSER_SESSION_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/browser.js',
            BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
            BIJUX_BROWSER_VALIDATOR_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/index.js',
            BIJUX_BROWSER_CORE_PATH: installedCorePath,
        }));
        reports.push({ consumer: 'validator', root_identity: rootIdentity });
    }
    async function browserApps() {
        await verifyPrepared();
        const directory = resolve(root, 'artifacts/consumers/validator');
        const fixture = resolve(root, 'tests/parity/fixtures/test_minimal_valid_ro_crate');
        const files = await Promise.all(['ro-crate-metadata.json', 'file_list.tsv'].map(async (name) => [name, await readFile(resolve(fixture, name), 'utf8')]));
        const invalid = withoutRootName(files[0][1]);
        const invalidFiles = [[files[0][0], JSON.stringify(invalid)], files[1]];
        const host = await serve(directory);
        try {
            for (const [engineName, engine] of selectedEngines({ chromium, firefox, webkit })) {
                const browser = await engine.launch({ headless: true });
                try {
                    const context = await browser.newContext({ serviceWorkers: 'block' });
                    const unexpected = [];
                    await context.route('**/*', route => {
                        const url = new URL(route.request().url());
                        if (url.origin !== host.origin) {
                            unexpected.push(url.href);
                            return route.abort();
                        }
                        return route.continue();
                    });
                    for (const pageName of ['index.html', 'bundled.html']) {
                        const page = await context.newPage();
                        await page.goto(host.origin + '/' + pageName);
                        await page.waitForFunction(() => typeof window.validate === 'function');
                        const success = await page.evaluate(files => window.validate(files), files);
                        assert.equal(success.state, 'valid');
                        assert.equal(success.eligible, true);
                        assert.deepEqual(success.handed, files);
                        const failure = await page.evaluate(files => window.validate(files), invalidFiles);
                        assert.equal(failure.state, 'invalid');
                        assert.equal(failure.eligible, false);
                        assert.equal((await page.evaluate(files => window.inline(files), files)).status, 'valid');
                        assert.equal((await page.evaluate(files => window.inline(files), invalidFiles)).status, 'invalid');
                        const propagation = await page.evaluate(async (files) => {
                            const selected = new Map(files);
                            const url = 'https://example.org/contexts/propagation';
                            const metadata = selected.get('ro-crate-metadata.json');
                            if (metadata === undefined)
                                throw new Error('Metadata is missing');
                            const document = JSON.parse(metadata);
                            if (!document || typeof document !== 'object' || !('@context' in document) || !Array.isArray(document['@context']))
                                throw new TypeError('Expected metadata context');
                            document['@context'].push(url);
                            selected.set('ro-crate-metadata.json', JSON.stringify(document));
                            const rows = [];
                            for (const serialized of [false, true])
                                for (const propagate of [false, true]) {
                                    const context = { '@context': { '@propagate': propagate } };
                                    const options = { contexts: new Map([[url, serialized ? JSON.stringify(context) : context]]) };
                                    const inline = await window.inline([...selected], options);
                                    const worker = await window.validate([...selected], options);
                                    rows.push({ serialized, propagate, inline: inline.status, worker: worker.state,
                                        eligible: worker.eligible, empty_report: inline.report.highest_error_level === null });
                                }
                            return rows;
                        }, files);
                        for (const item of propagation) {
                            assert.equal(item.inline, 'valid');
                            assert.equal(item.worker, 'valid');
                            assert.equal(item.eligible, true);
                            assert.equal(item.empty_report, true);
                        }
                        const ownership = await page.evaluate(async (files) => {
                            const path = 'ro-crate-metadata.json';
                            const entry = files.find(([name]) => name === path);
                            if (!entry)
                                throw new Error('Metadata is missing');
                            const original = entry[1];
                            const results = [];
                            for (const kind of ['ArrayBuffer', 'Blob']) {
                                let input, callerBytes;
                                if (kind === 'ArrayBuffer') {
                                    class CallerBuffer extends ArrayBuffer {
                                        slice() { return this; }
                                    }
                                    input = new CallerBuffer(new TextEncoder().encode(original).byteLength);
                                    callerBytes = new Uint8Array(input);
                                    callerBytes.set(new TextEncoder().encode(original));
                                }
                                else {
                                    class CallerBlob extends Blob {
                                        async arrayBuffer() { return new TextEncoder().encode('{}').buffer; }
                                        async text() { return '{}'; }
                                    }
                                    input = new CallerBlob([original]);
                                }
                                const outcome = await window.validate(files.map(([name, value]) => [name, name === path ? input : value]));
                                if (callerBytes) {
                                    callerBytes.fill(32);
                                    callerBytes.set(new TextEncoder().encode('{}'));
                                }
                                const handed = outcome.handed?.find(([name]) => name === path)?.[1];
                                if (!(handed instanceof Blob) && !(handed instanceof ArrayBuffer) && !ArrayBuffer.isView(handed))
                                    throw new TypeError('Expected handed bytes');
                                const text = handed instanceof Blob ? await handed.text() : new TextDecoder().decode(handed);
                                if (!outcome.handed)
                                    throw new Error('Expected approved files');
                                const recheck = await window.inline(outcome.handed);
                                results.push({ kind, state: outcome.state, eligible: outcome.eligible,
                                    exact_bytes: text === original, revalidated: recheck.status });
                            }
                            return results;
                        }, files);
                        assert.equal(ownership.length, 2);
                        for (const item of ownership) {
                            assert.equal(item.state, 'valid');
                            assert.equal(item.eligible, true);
                            assert.equal(item.exact_bytes, true);
                            assert.equal(item.revalidated, 'valid');
                        }
                        reports.push({ consumer: 'validator', engine: engineName, version: browser.version(), page: pageName,
                            public_inline_api: true, installed_module_worker: true, exact_byte_handoff: true, context_propagation: propagation, caller_owned_inputs: ownership });
                        await page.close();
                    }
                    assert.deepEqual(unexpected, []);
                }
                finally {
                    await browser.close();
                }
            }
        }
        finally {
            await host.close();
        }
    }
    return { nodeChecks, installedBrowserChecks, browserApps };
}

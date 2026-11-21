// Generated from tests/package/harness/install.mts by npm run generate:runtime; do not edit.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rm, realpath, mkdtemp, readdir, cp, copyFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { validateFixture } from './fixtures.mjs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseJson, packageLockField, versionField, packedFilename } from './receipts.mjs';
import { assertNoPreloads } from './node-options.mjs';
export { assertPublicInventory, planConsumers } from './plan.mjs';
export function createInstaller({ root, packages, plans, installedPaths, run }) {
    const proofPath = resolve(root, 'artifacts/consumers/proof.json');
    const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
    const portable = (path) => relative(root, path).replaceAll('\\', '/');
    async function archiveProof() {
        for (const item of packages) {
            const bytes = await readFile(item.archive);
            assert.equal(sha256(bytes), item.sha256, 'Package archive SHA-256 mismatch');
            const [algorithm, digest] = item.integrity.split('-');
            assert.equal(createHash(algorithm).update(bytes).digest('base64'), digest, 'Package archive integrity mismatch');
        }
    }
    async function typeProof(directory, item, entry, fixture) {
        const checker = fileURLToPath(new URL('./typecheck.mjs', import.meta.url));
        return ['node', 'browser'].map(environment => {
            const roots = environment === 'node' ? fixture.nodeRoots : fixture.browserRoots;
            const required = fixture.required.filter(item => item.environment === environment);
            const output = run('node', [checker, directory, item.name, environment, entry, JSON.stringify(roots), JSON.stringify(required)], root);
            return { environment, files: parseJson(output), sha256: sha256(output) };
        });
    }
    async function copySources(directory, fixture) {
        await validateFixture(root, fixture);
        for (const { source, target } of fixture.files) {
            const output = resolve(directory, target);
            await mkdir(dirname(output), { recursive: true });
            await copyFile(resolve(root, source), output);
        }
    }
    async function emitFixtures(directory, fixture) {
        for (const entry of [fixture.runtimeEntry, fixture.browserEntry]) {
            if (!entry)
                continue;
            const source = await readFile(resolve(directory, entry.source), 'utf8');
            const result = ts.transpileModule(source, { fileName: entry.source, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
            await mkdir(dirname(resolve(directory, entry.output)), { recursive: true });
            await writeFile(resolve(directory, entry.output), result.outputText);
        }
    }
    async function generatedInventory(directory, prefix = '') {
        const paths = [];
        for (const item of await readdir(resolve(directory, prefix), { withFileTypes: true })) {
            if (!prefix && ['node_modules', 'browser-types', 'package.json', 'package-lock.json'].includes(item.name))
                continue;
            assert.ok(!item.isSymbolicLink(), 'Unexpected symlink in prepared scenario');
            const path = prefix ? prefix + '/' + item.name : item.name;
            if (item.isDirectory())
                paths.push(...await generatedInventory(directory, path));
            else if (item.isFile())
                paths.push(path);
        }
        return paths.sort();
    }
    async function consumerProof() {
        await archiveProof();
        const consumers = [];
        for (const plan of plans) {
            const name = plan.item.directory, selected = plan.packages;
            const directory = resolve(root, 'artifacts/consumers', name);
            const lock = parseJson(await readFile(resolve(directory, 'package-lock.json'), 'utf8'));
            const scenario = await plan.scenario();
            const scenarioEntry = scenario.entry ?? '.';
            const installed = [];
            for (const item of selected) {
                assert.equal(packageLockField(lock, 'node_modules/' + item.name, 'integrity'), item.integrity, 'Installed archive integrity mismatch');
                const manifest = JSON.parse(await readFile(resolve(directory, 'node_modules', item.name, 'package.json'), 'utf8'));
                const entry = item.name === plan.item.name ? scenarioEntry : (Object.hasOwn(manifest.exports, '.') ? '.' : Object.keys(manifest.exports)[0]);
                assert.ok(entry && Object.hasOwn(manifest.exports, entry), 'Scenario entry is not a public export');
                const specifier = item.name + (entry === '.' ? '' : entry.slice(1));
                const url = run('node', ['--input-type=module', '--eval', `console.log(import.meta.resolve(${JSON.stringify(specifier)}))`], directory).trim();
                assert.ok((await realpath(fileURLToPath(url))).startsWith(directory + '/node_modules/'), 'Consumer resolved a source-workspace fallback');
                const files = [];
                for (const path of item.files) {
                    const target = resolve(directory, 'node_modules', item.name, path);
                    assert.ok((await realpath(target)).startsWith(directory + '/node_modules/'), 'Installed file escapes the consumer');
                    files.push({ path, sha256: sha256(await readFile(target)) });
                }
                installed.push({ name: item.name, archive: portable(item.archive), sha256: item.sha256,
                    integrity: item.integrity, entry: portable(fileURLToPath(url)), files });
            }
            const fixture = scenario.fixture;
            await validateFixture(root, fixture);
            const preparedFiles = scenario.prepareFiles ?? [];
            assert.equal(Boolean(scenario.prepare), preparedFiles.length > 0, 'Prepared scenario files require a generator');
            assert.equal(new Set(preparedFiles).size, preparedFiles.length, 'Duplicate scenario preparation file');
            for (const file of preparedFiles)
                assert.match(file, /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, 'Invalid scenario preparation file');
            const expectedPaths = [...fixture.files.map(file => file.target), fixture.runtimeEntry.output,
                ...(fixture.browserEntry ? [fixture.browserEntry.output] : []), ...preparedFiles].sort();
            assert.equal(new Set(expectedPaths).size, expectedPaths.length, 'Scenario output paths overlap');
            assert.deepEqual(await readdir(resolve(directory, 'browser-types')), [], 'Browser type roots must be empty');
            assert.deepEqual(await generatedInventory(directory), expectedPaths, 'Prepared scenario file inventory differs');
            const typeEvidence = await typeProof(directory, plan.item, scenarioEntry, fixture);
            await mkdir(resolve(root, 'artifacts/work'), { recursive: true });
            const check = await mkdtemp(resolve(root, 'artifacts/work/scenario-proof-'));
            const generated = [];
            try {
                await cp(resolve(directory, 'node_modules'), resolve(check, 'node_modules'), { recursive: true, dereference: true });
                await copyFile(resolve(directory, 'package.json'), resolve(check, 'package.json'));
                await mkdir(resolve(check, 'browser-types'));
                await copySources(check, fixture);
                await typeProof(check, plan.item, scenarioEntry, fixture);
                await emitFixtures(check, fixture);
                if (scenario.prepare)
                    await scenario.prepare(check);
                assert.deepEqual(await generatedInventory(check), expectedPaths, 'Scenario preparation file inventory differs');
                for (const file of expectedPaths) {
                    const target = await realpath(resolve(directory, file));
                    const local = relative(directory, target);
                    assert.ok(local !== '..' && !local.startsWith('..' + sep) && !isAbsolute(local), 'Prepared scenario file escapes consumer');
                    const actual = await readFile(target), fresh = await readFile(resolve(check, file));
                    assert.deepEqual(actual, fresh, 'Prepared scenario file differs from current generator or source: ' + file);
                    generated.push({ file, sha256: sha256(fresh) });
                }
            }
            finally {
                await rm(check, { recursive: true, force: true });
            }
            const scenarioHash = sha256(JSON.stringify({ entry: scenarioEntry, fixture, compiler: { version: ts.version, target: 'ES2022', module: 'ES2022' }, generated, typeEvidence }));
            consumers.push({ name, directory: portable(directory), packages: installed, scenario_sha256: scenarioHash, type_evidence: typeEvidence });
        }
        return { consumers, installedPaths };
    }
    async function verifyPrepared() {
        const expected = parseJson(await readFile(proofPath, 'utf8'));
        const actual = await consumerProof();
        assert.deepEqual(actual, expected, 'Prepared consumer contents differ from their package proof');
        return actual;
    }
    async function prepare() {
        await archiveProof();
        const typeDirectory = resolve(root, 'artifacts/tools/consumer-types');
        await mkdir(typeDirectory, { recursive: true });
        const rootLock = parseJson(await readFile(resolve(root, 'package-lock.json'), 'utf8'));
        const typeArchives = [];
        for (const name of ['@types/node', 'undici-types']) {
            const installed = resolve(root, 'node_modules', name);
            const manifest = versionField(parseJson(await readFile(resolve(installed, 'package.json'), 'utf8')));
            assert.equal(manifest, packageLockField(rootLock, 'node_modules/' + name, 'version'));
            const packed = packedFilename(parseJson(run('npm', ['pack', installed, '--ignore-scripts', '--pack-destination', typeDirectory, '--json'], root)));
            typeArchives.push(resolve(typeDirectory, packed));
        }
        for (const plan of plans) {
            const name = plan.item.directory, selected = plan.packages;
            const directory = resolve(root, 'artifacts/consumers', name);
            await rm(directory, { recursive: true, force: true });
            await mkdir(directory, { recursive: true });
            await writeFile(resolve(directory, 'package.json'), JSON.stringify({ name: `bijux-${name}-consumer`, version: '1.0.0', private: true, type: 'module' }));
            run('npm', ['install', '--ignore-scripts', '--offline', '--no-audit', ...selected.map(item => item.archive)], directory);
            const lock = parseJson(await readFile(resolve(directory, 'package-lock.json'), 'utf8'));
            for (const item of selected)
                assert.equal(packageLockField(lock, 'node_modules/' + item.name, 'integrity'), item.integrity, 'Installed archive integrity mismatch');
            const scenario = await plan.scenario();
            run('npm', ['install', '--save-dev', '--ignore-scripts', '--offline', '--no-audit', ...typeArchives], directory);
            await mkdir(resolve(directory, 'browser-types'), { recursive: true });
            await copySources(directory, scenario.fixture);
            await typeProof(directory, plan.item, scenario.entry ?? '.', scenario.fixture);
            await emitFixtures(directory, scenario.fixture);
            if (scenario.prepare)
                await scenario.prepare(directory);
        }
        const proof = await consumerProof();
        await writeFile(proofPath, JSON.stringify(proof, null, 2) + '\n');
        return { prepared: true, strict_node_typescript: true, strict_browser_typescript: true, ...proof };
    }
    return { prepare, verifyPrepared };
}
export async function runScenarios(plans, proof, root, execute, nodeVersion) {
    assertNoPreloads(process.env.NODE_OPTIONS);
    assert.deepEqual(proof.consumers.map(item => item.name), plans.map(plan => plan.item.directory), 'Scenario receipt inventory differs');
    await mkdir(resolve(root, 'artifacts/work'), { recursive: true });
    await mkdir(resolve(root, 'artifacts/reports'), { recursive: true });
    const results = [];
    for (const [index, plan] of plans.entries()) {
        const consumer = proof.consumers[index];
        const installed = consumer.packages.find(item => item.name === plan.item.name);
        assert.ok(installed, 'Scenario lacks its installed package');
        const directory = resolve(root, 'artifacts/consumers', plan.item.directory);
        const target = await realpath(resolve(root, installed.entry));
        const coverage = await mkdtemp(resolve(root, 'artifacts/work/scenario-coverage-'));
        try {
            const guard = fileURLToPath(new URL('./runtime-guard.mjs', import.meta.url));
            const scenario = await plan.scenario();
            await validateFixture(root, scenario.fixture);
            execute(['--import', guard, resolve(directory, scenario.fixture.runtimeEntry.output)], { BIJUX_CONSUMER_ROOT: directory, NODE_V8_COVERAGE: coverage });
            const records = [];
            for (const file of await readdir(coverage)) {
                const report = JSON.parse(await readFile(resolve(coverage, file), 'utf8'));
                for (const script of report.result) {
                    if (!script.url.startsWith('file:'))
                        continue;
                    if (await realpath(fileURLToPath(script.url)).catch(() => '') !== target)
                        continue;
                    if (script.functions.some(item => item.ranges.some(range => range.count > 0)))
                        records.push(script);
                }
            }
            assert.ok(records.length, 'Installed scenario did not load the target package');
            const evidence = JSON.stringify(records) + '\n';
            const evidencePath = `artifacts/reports/installed-scenario-${plan.item.directory}-node${nodeVersion.split('.')[0]}.json`;
            await writeFile(resolve(root, evidencePath), evidence);
            results.push({ package: plan.item.name, node_version: nodeVersion, distribution: 'installed', imported_module: installed.entry,
                scenario_sha256: consumer.scenario_sha256, type_evidence_sha256: consumer.type_evidence.map(({ environment, sha256 }) => ({ environment, sha256 })), load_evidence: evidencePath, load_evidence_sha256: createHash('sha256').update(evidence).digest('hex') });
        }
        finally {
            await rm(coverage, { recursive: true, force: true });
        }
    }
    return results;
}

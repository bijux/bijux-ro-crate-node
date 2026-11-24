// Generated from tests/package/consumers.mts by npm run generate:runtime; do not edit.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from '../../scripts/workspaces.mjs';
import { assertPublicInventory, createInstaller, planConsumers, runScenarios } from './harness/install.mjs';
import { packagesInOrder } from '../../scripts/workspaces.mjs';
import { coreScenario } from './core.mjs';
import { creatorScenario, creatorBrowser } from './creator.mjs';
import { validatorScenario } from './validator/scenario.mjs';
import { parseJson, packageRecords } from './harness/receipts.mjs';
import { releaseNodes, admittedNodes } from './runtime-policy.mjs';
export async function main(input) {
    function run(command, args, cwd, extraEnv = {}) {
        const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 300000, killSignal: 'SIGKILL', env: { ...process.env,
                npm_config_cache: resolve(root, 'artifacts/cache/npm'), npm_config_logs_dir: resolve(root, 'artifacts/logs/npm'), ...extraEnv } });
        if (result.status !== 0)
            throw new Error(`${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
        return result.stdout;
    }
    const packages = packageRecords(parseJson(await readFile(resolve(root, 'artifacts/packages/manifest.json'), 'utf8')))
        .map(item => ({ ...item, archive: resolve(root, 'artifacts/packages', basename(item.archive)) }));
    const publicWorkspaces = (await packagesInOrder()).filter(item => !item.manifest.private).map(item => ({
        name: item.manifest.name, directory: item.directory, version: item.manifest.version, dependencies: item.manifest.dependencies ?? {},
    }));
    assertPublicInventory(packages, publicWorkspaces);
    const corePackage = packages.find(item => item.directory === 'core');
    const creatorPackage = packages.find(item => item.directory === 'creator');
    assert.ok(creatorPackage);
    const validatorPackage = packages.find(item => item.directory === 'validator');
    assert.ok(corePackage && validatorPackage);
    const core = corePackage, validator = validatorPackage;
    const plans = planConsumers(packages, new Map([
        [core.name, async () => coreScenario(core)],
        [creatorPackage.name, async () => creatorScenario(creatorPackage)],
        [validator.name, async () => ({ ...await validatorScenario(validator, root), prepareFiles: ['index.html', 'bundle.js', 'worker.js', 'bundled.html'], prepare: async (directory) => (await import('./validator/apps.mjs')).prepareApps(directory, core, validator) })],
    ]));
    const args = [...input];
    assert.ok(args.length <= 1 && args.every(value => ['--prepare', '--verify', '--node', '--browser-apps', '--browser-guards'].includes(value)), 'Unknown package qualification mode');
    const mode = args[0] ?? '--all';
    const guardLane = process.env.BIJUX_TEST_INSTALLED_GUARD;
    assert.ok(guardLane === undefined || mode === '--browser-guards', 'Installed guard partition requires browser-guards mode');
    const reports = [];
    const pinnedNodes = [...releaseNodes];
    const installedCorePath = '/artifacts/consumers/validator/node_modules/' + core.name + '/dist/index.js';
    const installedPaths = {
        BIJUX_BROWSER_CORE_PATH: installedCorePath,
        BIJUX_BROWSER_VALIDATOR_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/index.js',
        BIJUX_BROWSER_SESSION_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/browser.js',
        BIJUX_BROWSER_WORKER_PATH: '/artifacts/consumers/validator/node_modules/' + validator.name + '/dist/worker.js',
    };
    const { prepare, verifyPrepared } = createInstaller({ root, packages, plans, installedPaths, run });
    const context = { root, core, validator, run, verifyPrepared, installedCorePath, installedPaths, mode, reports };
    async function nodeChecks(nodeVersions) {
        const proof = await verifyPrepared();
        for (const version of nodeVersions) {
            const direct = mode === '--node';
            const execute = (args, extraEnv = {}) => direct
                ? run(process.execPath, args, root, extraEnv)
                : run('npm', ['exec', '--yes', '--package=node@' + version, '--', 'node', ...args], root, extraEnv);
            if (direct)
                assert.equal(process.versions.node, version);
            else
                assert.equal(run('npm', ['exec', '--yes', '--package=node@' + version, '--', 'node', '--version'], root).trim(), 'v' + version);
            reports.push(...await runScenarios(plans, proof, root, execute, version));
        }
        return (await import('./validator/node.mjs')).nodeChecks(context, nodeVersions);
    }
    if (mode === '--all' || mode === '--prepare')
        reports.push(await prepare());
    if (mode === '--verify')
        reports.push(await verifyPrepared());
    if (mode === '--all' || mode === '--node') {
        const selected = process.env.BIJUX_TEST_NODE ?? process.versions.node;
        if (mode === '--node')
            assert.ok(admittedNodes.includes(selected), 'Unsupported package test Node version');
        reports.push({ consumer: 'validator', installed_corpus: await nodeChecks(mode === '--all' ? pinnedNodes : [selected]) });
    }
    if (mode === '--all' || mode === '--browser-guards' || mode === '--browser-apps') {
        const checks = (await import('./validator/browser.mjs')).browserQualification(context);
        if (mode === '--all' || mode === '--browser-guards')
            await checks.installedBrowserChecks({ corpora: mode === '--all', lane: guardLane });
        if (mode === '--all' || mode === '--browser-apps') {
            await verifyPrepared();
            await creatorBrowser(root);
            await checks.browserApps();
        }
    }
    const suffix = mode === '--all' ? '' : ['--browser-apps', '--browser-guards'].includes(mode) ? '-' + mode.slice(2) + '-' + (process.env.BIJUX_TEST_ENGINE ?? 'all') + (guardLane === undefined ? '' : '-' + guardLane) : '-' + mode.slice(2) + (mode === '--node' ? '-' + process.versions.node.split('.')[0] : '');
    await mkdir(resolve(root, 'artifacts/reports'), { recursive: true });
    await writeFile(resolve(root, `artifacts/reports/package-consumers${suffix}.json`), JSON.stringify(reports, null, 2) + '\n');
    console.log(JSON.stringify(reports, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
    await main(process.argv.slice(2));

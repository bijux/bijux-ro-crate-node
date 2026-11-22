// Generated from scripts/testing/root-tests.mts by npm run generate:runtime; do not edit.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { basename, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverTests } from '../test-discovery.mjs';
import { entries, runtimeEntryPaths } from '../runtime-entries.mjs';
import { createReferencePlan } from '../reference/plan.mjs';
import { root as workspaceRoot } from '../workspaces.mjs';
const exceptions = ['tests/browser/file-access.test.ts', 'tests/reference/competing-collections/contracts.test.mjs'];
const generated = new Map(entries.map(entry => runtimeEntryPaths(entry)).map(({ source, output }) => [output, source]));
const emitted = new Map([...generated].map(([output, source]) => [source, output]));
const portable = (path) => path.split(sep).join('/');
const canonical = (path) => generated.get(path) ?? path;
export async function collectRootTestOwnership(options = {}) {
    const root = options.root ?? workspaceRoot;
    const plan = options.plan ?? createReferencePlan({ python: 'artifacts/reference/python-env/bin/python', nodeExecutable: process.execPath });
    const discovered = (await discoverTests(resolve(root, 'tests'))).map(path => 'tests/' + portable(path));
    const rows = new Map();
    for (const path of discovered) {
        const source = canonical(path);
        if (!rows.has(source))
            rows.set(source, { source, execution: emitted.get(source) ?? source, ordinaryScopes: [], specializedCommands: [] });
    }
    const addOrdinary = (path, tooling) => {
        const row = rows.get(canonical(path));
        assert.ok(row, 'Selected test does not exist: ' + path);
        if (!row.ordinaryScopes.includes('all'))
            row.ordinaryScopes.push('all');
        if (tooling && !row.ordinaryScopes.includes('tooling'))
            row.ordinaryScopes.push('tooling');
    };
    for (const path of discovered) {
        if (['tests/ci/', 'tests/tooling/', 'tests/parity/', 'tests/standards/'].some(prefix => path.startsWith(prefix)))
            addOrdinary(path, path.startsWith('tests/ci/') || path.startsWith('tests/tooling/'));
    }
    for (const path of exceptions) {
        assert.ok((await stat(resolve(root, path))).isFile(), 'Selected test does not exist: ' + path);
        addOrdinary(path, false);
    }
    for (const [name, commands] of Object.entries(plan.referenceGroups))
        for (const [index, command] of commands.entries()) {
            if (!command.args.includes('--test'))
                continue;
            const files = command.args.filter(arg => arg.startsWith('tests/') && /^(?:test|test-.+|.+[.-]test)\.(?:js|cjs|mjs|ts|cts|mts)$/.test(basename(arg)));
            assert.equal(new Set(files.map(canonical)).size, files.length, `Duplicate test in ${name} command ${index + 1}`);
            for (const path of files) {
                assert.ok((await stat(resolve(root, path))).isFile(), 'Selected test does not exist: ' + path);
                const row = rows.get(canonical(path));
                assert.ok(row, 'Specialized test is not discoverable: ' + path);
                row.specializedCommands.push(name + ':' + (index + 1));
            }
        }
    return [...rows.values()].sort((a, b) => a.source.localeCompare(b.source));
}
export async function collectRootTests(scope, options = {}) {
    assert.ok(scope === 'all' || scope === 'tooling', 'Invalid root test scope: ' + scope);
    const paths = (await collectRootTestOwnership(options)).filter(row => row.ordinaryScopes.includes(scope)).map(row => row.execution);
    assert.ok(paths.length, 'No root test files selected for ' + scope);
    for (const path of paths)
        assert.ok((await stat(resolve(options.root ?? workspaceRoot, path))).isFile(), 'Selected test does not exist: ' + path);
    return paths;
}
export async function auditRootTestOwnership(options = {}) {
    const rows = await collectRootTestOwnership(options);
    const missing = rows.filter(row => !row.ordinaryScopes.length && !row.specializedCommands.length).map(row => row.source);
    assert.deepEqual(missing, [], 'Root tests have no execution owner: ' + missing.join(', '));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    let scope = 'all', audit = false, list = false, json = false;
    const forwarded = [];
    const valued = new Set(['--test-name-pattern', '--test-skip-pattern', '--test-reporter', '--test-reporter-destination', '--test-concurrency', '--test-timeout', '--test-shard', '--test-coverage-lines', '--test-coverage-functions', '--test-coverage-branches']);
    const flags = new Set(['--test-only', '--experimental-test-coverage', '--test-force-exit']);
    const args = process.argv.slice(2);
    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (arg === '--scope') {
            scope = args[++index];
            continue;
        }
        if (arg === '--audit') {
            audit = true;
            continue;
        }
        if (arg === '--list') {
            list = true;
            continue;
        }
        if (arg === '--json') {
            json = true;
            continue;
        }
        const option = arg.split('=')[0];
        assert.ok(valued.has(option) || flags.has(option), 'Unsupported root test option: ' + arg);
        forwarded.push(arg);
        if (valued.has(option) && !arg.includes('=')) {
            assert.ok(args[index + 1], 'Missing value for ' + arg);
            forwarded.push(args[++index]);
        }
    }
    assert.ok(scope === 'all' || scope === 'tooling', 'Invalid root test scope: ' + scope);
    assert.ok(!json || list, '--json requires --list');
    assert.ok(!(audit || list) || forwarded.length === 0, 'Test options require execution');
    if (audit)
        await auditRootTestOwnership();
    if (list) {
        const rows = await collectRootTestOwnership();
        if (json)
            console.log(JSON.stringify(rows, null, 2));
        else
            for (const row of rows)
                console.log(`${row.source}\t${row.execution}\t${[...row.ordinaryScopes, ...row.specializedCommands].join(', ')}`);
    }
    if (!audit && !list) {
        const paths = await collectRootTests(scope);
        const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...forwarded, ...paths], { cwd: workspaceRoot, stdio: 'inherit' });
        if (result.error)
            throw result.error;
        if (result.signal)
            process.kill(process.pid, result.signal);
        process.exit(result.status ?? 1);
    }
}

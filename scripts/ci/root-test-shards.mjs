// Generated from scripts/ci/root-test-shards.mts by npm run generate:runtime; do not edit.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const prefix = 'node --import tsx --test ';
const heavy = {
    'workspace-build': 'tests/ci/workspace-build.test.ts',
    'installed-workspaces': 'tests/ci/installed-workspace-consumers.test.ts',
    'compiler-contract': 'tests/ci/workspace-compiler-contract.test.ts',
};
export async function expandRootTestCommand(command) {
    assert.ok(command.startsWith(prefix), 'Unsupported root test command');
    const tokens = command.slice(prefix.length).split(' ');
    assert.ok(tokens.length && tokens.every(Boolean), 'Invalid root test command');
    const files = [];
    for (const token of tokens) {
        if (token.includes('*')) {
            assert.ok(token === 'tests/ci/*.test.ts' || token === 'tests/ci/*.test.mjs', 'Unsupported root test pattern: ' + token);
            const extension = token.endsWith('.ts') ? '.test.ts' : '.test.mjs';
            files.push(...(await readdir(resolve(root, 'tests/ci'))).filter(name => name.endsWith(extension)).sort().map(name => 'tests/ci/' + name));
        }
        else {
            assert.ok(/^tests\/[a-zA-Z0-9_./-]+\.test\.(?:ts|mjs)$/.test(token) && !token.split('/').includes('..'), 'Invalid root test file: ' + token);
            assert.ok((await stat(resolve(root, token))).isFile(), 'Missing root test file: ' + token);
            files.push(token);
        }
    }
    assert.equal(new Set(files).size, files.length, 'Duplicate root test file');
    return files;
}
export async function collectRootTestLanes() {
    const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
    const commands = manifest.scripts.test.split(' && ');
    assert.equal(commands.length, 2, 'Unsupported root test command');
    assert.equal(commands[0], 'node scripts/workspaces.mjs test', 'Unsupported workspace test command');
    const all = await expandRootTestCommand(commands[1]);
    const isolated = Object.values(heavy);
    for (const path of isolated)
        assert.ok(all.includes(path), 'Missing isolated root test: ' + path);
    const ordinary = all.filter(path => !isolated.includes(path));
    assert.ok(ordinary.length >= 2, 'Not enough ordinary root tests for both lanes');
    const lanes = {
        'ordinary-1': ordinary.filter((_, index) => index % 2 === 0),
        'ordinary-2': ordinary.filter((_, index) => index % 2 === 1),
        ...Object.fromEntries(Object.entries(heavy).map(([name, path]) => [name, [path]])),
    };
    return { all, lanes };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [lane, ...extra] = process.argv.slice(2);
    assert.ok(lane && !extra.length, 'Expected one root test lane');
    const { lanes } = await collectRootTestLanes();
    assert.ok(Object.hasOwn(lanes, lane), 'Unknown root test lane: ' + lane);
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...lanes[lane]], { cwd: root, stdio: 'inherit' });
    if (result.error)
        throw result.error;
    if (result.signal)
        process.kill(process.pid, result.signal);
    process.exit(result.status ?? 1);
}

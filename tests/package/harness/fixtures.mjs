// Generated from tests/package/harness/fixtures.mts by npm run generate:runtime; do not edit.
import assert from 'node:assert/strict';
import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
function safePath(path) {
    assert.ok(typeof path === 'string' && /^[a-zA-Z0-9._/-]+$/.test(path) && !isAbsolute(path) &&
        path.split('/').every(part => part && part !== '.' && part !== '..'), 'Invalid fixture path: ' + path);
}
function safeTarget(path) {
    safePath(path);
    assert.ok(!['node_modules', 'browser-types', 'package.json', 'package-lock.json', '.git'].includes(path.split('/')[0]), 'Reserved fixture target: ' + path);
}
export async function validateFixture(root, fixture) {
    const owner = await realpath(root);
    const targets = new Set();
    assert.ok(fixture.files.length > 0, 'Fixture must contain source files');
    for (const { source, target } of fixture.files) {
        safePath(source);
        safeTarget(target);
        assert.ok(!targets.has(target), 'Duplicate fixture target: ' + target);
        targets.add(target);
        const actual = await realpath(resolve(owner, source));
        const boundary = relative(owner, actual);
        assert.ok(boundary !== '..' && !boundary.startsWith('..' + sep) && !isAbsolute(boundary), 'Fixture source escapes repository: ' + source);
        assert.ok(!['node_modules', 'artifacts', '.git'].includes(boundary.split(sep)[0]), 'Fixture source must be repository-owned: ' + source);
        assert.ok((await stat(actual)).isFile(), 'Fixture source must be a file: ' + source);
    }
    for (const roots of [fixture.nodeRoots, fixture.browserRoots]) {
        assert.ok(roots.length > 0 && new Set(roots).size === roots.length, 'Fixture roots must be nonempty and unique');
        for (const path of roots)
            assert.ok(targets.has(path) && /\.ts$/.test(path), 'Fixture root is not a copied TypeScript file: ' + path);
    }
    const outputs = new Set();
    for (const [entry, roots] of [[fixture.runtimeEntry, fixture.nodeRoots], [fixture.browserEntry, fixture.browserRoots]]) {
        if (!entry)
            continue;
        safeTarget(entry.output);
        assert.ok(roots.includes(entry.source), 'Fixture entry must be a checked root: ' + entry.source);
        assert.ok(entry.output.endsWith('.mjs') && !targets.has(entry.output) && !outputs.has(entry.output), 'Invalid fixture output: ' + entry.output);
        outputs.add(entry.output);
    }
    for (const environment of ['node', 'browser']) {
        const required = fixture.required.filter(item => item.environment === environment);
        assert.ok(required.length > 0, 'Each environment requires a public declaration');
        for (const item of required)
            assert.ok(item.packageName && (item.export === '.' || item.export.startsWith('./')), 'Invalid public declaration');
    }
}

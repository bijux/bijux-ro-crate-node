// Generated from scripts/typecheck.mts by npm run generate:runtime; do not edit.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import { packagesInOrder } from './workspaces.mjs';
const compiler = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));
async function filesUnder(directory) {
    let entries;
    try {
        entries = await readdir(directory, { withFileTypes: true });
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return [];
        throw error;
    }
    const files = [];
    for (const entry of entries) {
        if (entry.name === 'dist' || entry.name === 'node_modules')
            continue;
        const path = resolve(directory, entry.name);
        if (entry.isSymbolicLink())
            throw new Error('Unsupported package symlink: ' + path);
        if (entry.isDirectory())
            files.push(...await filesUnder(path));
        else if (entry.isFile())
            files.push(path);
    }
    return files;
}
const projects = [];
for (const item of await packagesInOrder()) {
    if (item.manifest.private)
        continue;
    const directory = fileURLToPath(item.path);
    const registered = new Set(item.manifest.bijux.typecheck.map(path => resolve(directory, path)));
    if (!registered.has(resolve(directory, item.manifest.bijux.declarations)))
        throw new Error('Declaration compiler project is not registered: ' + item.manifest.name);
    const authored = await filesUnder(directory);
    for (const path of authored.filter(path => /(?:^|\/)tsconfig(?:\.[^/]+)?\.json$/.test(path))) {
        if (registered.has(path))
            continue;
        const config = ts.readConfigFile(path, ts.sys.readFile);
        const value = config.config;
        const alias = value && typeof value === 'object' && Object.keys(value).length === 1 &&
            'extends' in value && typeof value.extends === 'string' && registered.has(resolve(dirname(path), value.extends));
        if (!alias)
            throw new Error('Unregistered compiler project: ' + path);
    }
    const covered = new Set();
    for (const project of registered) {
        const config = ts.readConfigFile(project, ts.sys.readFile);
        if (config.error)
            throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
        const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(project), undefined, project);
        if (parsed.errors.length)
            throw new Error(ts.flattenDiagnosticMessageText(parsed.errors[0].messageText, '\n'));
        const program = ts.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true });
        for (const source of program.getSourceFiles())
            covered.add(resolve(source.fileName));
        projects.push(project);
    }
    for (const path of authored.filter(path => /\.(?:ts|tsx|mts|cts)$/.test(path) && !/\.d\.(?:ts|mts|cts)$/.test(path)))
        if (!covered.has(path))
            throw new Error('Unregistered authored TypeScript: ' + path);
}
for (const project of [...projects, 'tests/types/tsconfig.validator-entry.json', 'tests/types/tsconfig.node.json', 'tests/types/tsconfig.browser.json', 'tests/package/tsconfig.consumers.json', 'tests/ci/tsconfig.tests.json', 'tests/browser/tsconfig.tests.json', 'tests/browser/tsconfig.harness.json', 'tests/browser/tsconfig.worker.json', 'examples/submission/tsconfig.json', 'tests/standards/tsconfig.tests.json', 'tsconfig.tooling.json']) {
    const source = spawnSync(process.execPath, [compiler, '-p', project, '--noEmit'], { stdio: 'inherit' });
    if (source.status !== 0)
        process.exit(source.status ?? 1);
}
const runtimeGenerator = fileURLToPath(new URL('./generate-runtime-entries.mts', import.meta.url));
const generatedRuntime = spawnSync(process.execPath, ['--import', 'tsx', runtimeGenerator, '--check'], { stdio: 'inherit' });
if (generatedRuntime.status !== 0)
    process.exit(generatedRuntime.status ?? 1);
console.log('Node-only and browser public declarations pass independently');

// Generated from scripts/workspaces.mts by npm run generate:runtime; do not edit.
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep, win32 } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
export function isPackageCompilerProject(path) {
    return /^tsconfig(?:\..+)?\.json$/.test(win32.basename(path));
}
function record(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
async function ownedFile(directory, path) {
    if (typeof path !== 'string' || !path || isAbsolute(path) || path.split(/[\\/]/).includes('..'))
        throw new Error('Invalid package-owned path: ' + String(path));
    const base = await realpath(directory);
    const file = await realpath(resolve(base, path));
    if (relative(base, file).startsWith('..' + sep) || relative(base, file) === '..' || !(await stat(file)).isFile())
        throw new Error('Package-owned path escapes package or is not a file: ' + path);
    return path;
}
async function readManifest(path) {
    const value = JSON.parse(await readFile(new URL('package.json', path), 'utf8'));
    if (!record(value) || typeof value.name !== 'string' || !value.name ||
        (value.private !== undefined && typeof value.private !== 'boolean') ||
        (value.dependencies !== undefined && (!record(value.dependencies) || Object.values(value.dependencies).some(v => typeof v !== 'string'))) ||
        (value.peerDependencies !== undefined && (!record(value.peerDependencies) || Object.values(value.peerDependencies).some(v => typeof v !== 'string'))))
        throw new Error('Invalid workspace manifest');
    if (value.private === true)
        return value;
    if (value.type !== 'module')
        throw new Error('Public workspace type must be module: ' + value.name);
    if (typeof value.version !== 'string' || !record(value.exports) || !Object.keys(value.exports).length ||
        !record(value.scripts) || typeof value.scripts.test !== 'string' || !value.scripts.test.trim() ||
        !record(value.roCrateBuild) || typeof value.roCrateBuild.declarations !== 'string' ||
        !Array.isArray(value.roCrateBuild.typecheck) || !value.roCrateBuild.typecheck.length ||
        !Array.isArray(value.roCrateBuild.standaloneEntries) || value.roCrateBuild.standaloneEntries.some(v => typeof v !== 'string'))
        throw new Error('Invalid public workspace contract: ' + value.name);
    const directory = fileURLToPath(path);
    await ownedFile(directory, value.roCrateBuild.declarations);
    for (const project of value.roCrateBuild.typecheck)
        await ownedFile(directory, project);
    for (const [entry, target] of Object.entries(value.exports)) {
        if (!/^(?:\.|\.\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)$/.test(entry) || !record(target) ||
            Object.keys(target).sort().join(',') !== 'import,types')
            throw new Error('Unsupported export: ' + entry);
        const name = entry === '.' ? 'index' : entry.slice(2);
        if (target.import !== './dist/' + name + '.js' || target.types !== './dist/' + name + '.d.ts')
            throw new Error('Invalid export target: ' + entry);
        await ownedFile(directory, 'src/' + name + '.ts');
    }
    for (const entry of value.roCrateBuild.standaloneEntries)
        if (!(entry in value.exports))
            throw new Error('Unknown standalone entry: ' + entry);
    return value;
}
export const root = fileURLToPath(new URL('../', import.meta.url));
export async function packagesInOrder(directoryRoot = root) {
    const packages = [];
    const directories = (await readdir(resolve(directoryRoot, 'packages'), { withFileTypes: true }))
        .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    for (const directory of directories) {
        const path = pathToFileURL(resolve(directoryRoot, 'packages', directory) + sep);
        const manifest = await readManifest(path);
        packages.push({ directory, path, manifest });
    }
    for (const item of packages) {
        if (item.manifest.private)
            continue;
        for (const [name, version] of Object.entries(item.manifest.dependencies ?? {})) {
            if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version))
                throw new Error('Dependency must use an exact release version: ' + name);
            const dependency = packages.find(candidate => candidate.manifest.name === name);
            if (dependency && (dependency.manifest.private || dependency.manifest.version !== version))
                throw new Error('Workspace dependency version does not match public release: ' + name);
        }
    }
    const names = new Set(packages.map(item => item.manifest.name));
    if (names.size !== packages.length)
        throw new Error('Duplicate workspace package name');
    const ordered = [];
    while (ordered.length < packages.length) {
        const ready = packages.filter(item => !ordered.includes(item) &&
            Object.keys(item.manifest.dependencies ?? {}).every(name => !names.has(name) || ordered.some(before => before.manifest.name === name)));
        if (!ready.length)
            throw new Error('Workspace dependency cycle');
        ordered.push(...ready);
    }
    return ordered;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const command = process.argv[2];
    const packages = await packagesInOrder();
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    if (manifest.private !== true)
        throw new Error('Workspace root must be private');
    for (const item of packages) {
        for (const dependency of Object.values(item.manifest.dependencies ?? {})) {
            if (/^(?:workspace|file|link):/.test(dependency))
                throw new Error('Unpublishable dependency: ' + dependency);
        }
        if (command === 'test' && item.manifest.scripts?.test) {
            const result = spawnSync('npm', ['test', '--workspace', item.manifest.name], { cwd: root, stdio: 'inherit' });
            if (result.status !== 0)
                process.exit(result.status ?? 1);
        }
    }
    if (command === 'check')
        console.log(packages.map(item => item.manifest.name).join('\n'));
}

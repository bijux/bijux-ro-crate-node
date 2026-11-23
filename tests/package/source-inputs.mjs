// Generated from tests/package/source-inputs.mts by npm run generate:runtime; do not edit.
import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sourceInputsVersion } from './source-contracts.mjs';
// This bounded inventory identifies selected inputs, not dependency integrity or build provenance.
export const sourceInputRoots = [
    'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.tooling.json',
    'packages/core/package.json', 'packages/core/tsconfig.json', 'packages/core/src', 'packages/core/dist',
    'packages/validator/package.json', 'packages/validator/tsconfig.json', 'packages/validator/src',
    'tests/parity', 'tests/reference', 'tests/support', 'tests/inputs',
    'tests/package/source.mts', 'tests/package/source.mjs',
    'tests/package/source-contracts.mts', 'tests/package/source-contracts.mjs',
    'tests/package/source-inputs.mts', 'tests/package/source-inputs.mjs',
    'tests/package/runtime-policy.mts', 'tests/package/runtime-policy.mjs',
    'scripts/workspaces.mts', 'scripts/workspaces.mjs', 'scripts/reference',
    'docs/compatibility/reference.json',
];
export async function fingerprintSourceInputs(root, roots = sourceInputRoots) {
    const entries = [];
    async function visit(path) {
        const full = resolve(root, path);
        const info = await lstat(full).catch(error => { throw new Error(`Cannot inspect required source input ${path}: ${error.message}`); });
        if (info.isSymbolicLink())
            throw new Error(`Unsupported source input symlink: ${path}`);
        if (info.isDirectory()) {
            entries.push({ path, kind: 'directory', bytes: Buffer.alloc(0) });
            const names = await readdir(full);
            for (const name of names.sort()) {
                if (name === '__pycache__' || name.endsWith('.pyc'))
                    continue;
                await visit(`${path}/${name}`);
            }
        }
        else if (info.isFile())
            entries.push({ path, kind: 'file', bytes: await readFile(full) });
        else
            throw new Error(`Unsupported source input entry: ${path}`);
    }
    for (const path of roots) {
        const parts = path.split('/');
        if (parts.some(part => !part || part === '.' || part === '..'))
            throw new Error(`Invalid source input path: ${path}`);
        for (let depth = 1; depth < parts.length; depth++) {
            const parent = parts.slice(0, depth).join('/');
            const info = await lstat(resolve(root, parent));
            if (info.isSymbolicLink())
                throw new Error(`Unsupported source input symlink: ${parent}`);
        }
        const previous = entries.length;
        await visit(path);
        if (!entries.slice(previous).some(entry => entry.kind === 'file'))
            throw new Error(`Required source input is empty: ${path}`);
    }
    entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    const hash = createHash('sha256');
    const frame = (value) => { const size = Buffer.alloc(8); size.writeBigUInt64BE(BigInt(value.length)); hash.update(size).update(value); };
    frame(Buffer.from(sourceInputsVersion));
    for (const entry of entries) {
        frame(Buffer.from(entry.path));
        frame(Buffer.from(entry.kind));
        frame(entry.bytes);
    }
    return hash.digest('hex');
}

// Generated from scripts/build/declarations.mts by npm run generate:runtime; do not edit.
import ts from 'typescript';
import { isBuiltin } from 'node:module';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
const declarationCompiler = { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext };
function declarationReferences(file, text) {
    const parsed = ts.preProcessFile(text, true, true);
    const defaultMode = file.endsWith('.d.cts') ? ts.ModuleKind.CommonJS : ts.ModuleKind.ESNext;
    const source = ts.createSourceFile(file, text, { languageVersion: ts.ScriptTarget.ESNext, impliedNodeFormat: defaultMode }, true);
    const positions = new Set(parsed.importedFiles.map(reference => reference.pos));
    const modes = new Map();
    function visit(node) {
        if (ts.isStringLiteralLike(node) && positions.has(node.getStart(source)))
            modes.set(node.getStart(source), ts.getModeForUsageLocation(source, node, declarationCompiler));
        ts.forEachChild(node, visit);
    }
    visit(source);
    return { parsed, defaultMode, mode: (reference) => modes.get(reference.pos) ?? defaultMode };
}
export async function verifyDeclarations(output, directory = output) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
        const file = resolve(directory, item.name);
        if (item.isDirectory()) {
            await verifyDeclarations(output, file);
            continue;
        }
        if (!/\.d\.(?:ts|mts|cts)$/.test(item.name))
            continue;
        const source = await readFile(file, 'utf8');
        const { parsed, mode } = declarationReferences(file, source);
        const dependencies = [
            ...parsed.importedFiles.filter(reference => /^\.{1,2}\//.test(reference.fileName))
                .map(reference => ({ name: reference.fileName, module: true, mode: mode(reference) })),
            ...parsed.referencedFiles.map(reference => ({ name: reference.fileName, module: false, mode: undefined })),
        ];
        for (const reference of dependencies) {
            const target = reference.module
                ? ts.resolveModuleName(reference.name, file, declarationCompiler, ts.sys, undefined, undefined, reference.mode).resolvedModule?.resolvedFileName
                : resolve(dirname(file), reference.name);
            if (!target)
                throw new Error('Missing declaration dependency: ' + reference.name + ' in ' + file);
            const candidate = resolve(target);
            if (relative(output, candidate).startsWith('..' + sep))
                throw new Error('Declaration escapes package: ' + file);
            let actual;
            try {
                actual = await realpath(candidate);
            }
            catch {
                throw new Error('Missing declaration dependency: ' + candidate);
            }
            if (relative(output, actual).startsWith('..' + sep))
                throw new Error('Declaration escapes package: ' + file);
            if (!(await stat(actual)).isFile() || !/\.d\.(?:ts|mts|cts)$/.test(actual))
                throw new Error('Missing declaration dependency: ' + candidate);
        }
    }
}
export async function verifyPublicDeclarationDependencies(output, exports, packageName, declared) {
    const pending = Object.values(exports).map(target => resolve(dirname(output), target.types)), visited = new Set();
    while (pending.length) {
        const file = resolve(pending.pop());
        if (visited.has(file))
            continue;
        visited.add(file);
        const source = await readFile(file, 'utf8');
        const { parsed, defaultMode, mode } = declarationReferences(file, source);
        for (const reference of parsed.referencedFiles)
            pending.push(resolve(dirname(file), reference.fileName));
        for (const reference of parsed.typeReferenceDirectives) {
            const referenceName = reference.fileName;
            const resolution = ts.resolveTypeReferenceDirective(referenceName, file, declarationCompiler, ts.sys, undefined, undefined, ts.getModeForFileReference(reference, defaultMode)).resolvedTypeReferenceDirective;
            if (!resolution)
                throw new Error('Unresolved declaration dependency: ' + referenceName + ' in ' + file);
            const typePackage = resolution.packageId?.name ?? (referenceName.startsWith('@types/') ? referenceName :
                '@types/' + (referenceName.startsWith('@') ? referenceName.slice(1).replace('/', '__') : referenceName));
            if (!declared.has(typePackage))
                throw new Error('Undeclared declaration dependency: ' + typePackage + ' in ' + file);
        }
        for (const reference of parsed.importedFiles) {
            const name = reference.fileName;
            if (/^\.{1,2}\//.test(name)) {
                const target = ts.resolveModuleName(name, file, declarationCompiler, ts.sys, undefined, undefined, mode(reference)).resolvedModule?.resolvedFileName;
                if (!target || relative(output, target).startsWith('..' + sep))
                    throw new Error('Missing declaration dependency: ' + name + ' in ' + file);
                pending.push(target);
                continue;
            }
            const packageRoot = isBuiltin(name) ? '@types/node' : name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0];
            if (packageRoot === packageName) {
                const entry = name === packageName ? '.' : './' + name.slice(packageName.length + 1);
                const target = exports[entry];
                if (!target)
                    throw new Error('Unexported self declaration dependency: ' + name + ' in ' + file);
                pending.push(resolve(dirname(output), target.types));
                continue;
            }
            const typesName = packageRoot.startsWith('@') ? '@types/' + packageRoot.slice(1).replace('/', '__') : '@types/' + packageRoot;
            if (!declared.has(packageRoot) && !declared.has(typesName))
                throw new Error('Undeclared declaration dependency: ' + packageRoot + ' in ' + file);
            if (isBuiltin(name))
                continue;
            const target = ts.resolveModuleName(name, file, declarationCompiler, ts.sys, undefined, undefined, mode(reference)).resolvedModule;
            if (!target)
                throw new Error('Unresolved declaration dependency: ' + name + ' in ' + file);
            if (target.packageId?.name.startsWith('@types/') && !declared.has(target.packageId.name))
                throw new Error('Undeclared declaration dependency: ' + target.packageId.name + ' in ' + file);
        }
    }
}

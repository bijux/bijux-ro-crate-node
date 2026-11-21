// Generated from tests/package/harness/typecheck.mts by npm run generate:runtime; do not edit.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
const [directory, targetName, environment, entry = '.', rootsJson, requiredJson, ...extra] = process.argv.slice(2);
assert.ok(directory && targetName && ['node', 'browser'].includes(environment) && !extra.length, 'Expected consumer, package and environment');
const root = realpathSync(directory);
const manifest = JSON.parse(readFileSync(resolve(root, 'node_modules', targetName, 'package.json'), 'utf8'));
assert.ok(Object.hasOwn(manifest.exports, entry), 'Scenario entry is not a public export');
const declaration = manifest.exports[entry].types;
assert.ok(typeof declaration === 'string' && declaration.startsWith('./'), 'Scenario entry lacks declarations');
const target = realpathSync(resolve(root, 'node_modules', targetName, declaration));
const args = ['--noEmit', '--strict', '--module', 'nodenext', '--target', 'ES2022', '--lib', environment === 'node' ? 'ES2022' : 'ES2022,DOM,DOM.Iterable',
    '--typeRoots', resolve(root, environment === 'node' ? 'node_modules/@types' : 'browser-types'), ...(environment === 'node' ? ['--types', 'node'] : [])];
const parsed = ts.parseCommandLine(args);
assert.equal(parsed.errors.length, 0);
const compilerLib = realpathSync(resolve(ts.getDefaultLibFilePath(parsed.options), '..'));
const inside = (file, parent) => {
    const path = relative(parent, file);
    return path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path);
};
assert.ok(inside(target, root), 'Installed declaration escapes consumer');
const host = ts.createCompilerHost(parsed.options);
const originalFileExists = host.fileExists, originalReadFile = host.readFile;
const allowed = (path) => {
    try {
        const file = realpathSync(path);
        return inside(file, root) || inside(file, compilerLib);
    }
    catch {
        return false;
    }
};
host.fileExists = path => allowed(path) && originalFileExists(path);
host.readFile = path => allowed(path) ? originalReadFile(path) : undefined;
host.getCurrentDirectory = () => root;
const roots = rootsJson ? JSON.parse(rootsJson) : [environment === 'node' ? 'node.ts' : 'consumer.ts'];
assert.ok(Array.isArray(roots) && roots.length && roots.every(item => typeof item === 'string' && item.endsWith('.ts')), 'Expected TypeScript consumer roots');
const rootFiles = roots.map((item) => realpathSync(resolve(root, item)));
assert.ok(rootFiles.every((file) => inside(file, root)), 'Consumer root escapes installed consumer');
const required = requiredJson ? JSON.parse(requiredJson) : [];
assert.ok(Array.isArray(required), 'Expected required public declarations');
const requiredDeclarations = required.map((item) => {
    assert.ok(item && typeof item === 'object', 'Invalid required public declaration');
    const { packageName, export: name } = item;
    assert.ok(typeof packageName === 'string' && /^(?:@[a-zA-Z0-9._-]+\/)?[a-zA-Z0-9._-]+$/.test(packageName) && typeof name === 'string', 'Invalid required public declaration');
    const packageRoot = realpathSync(resolve(root, 'node_modules', packageName));
    assert.ok(inside(packageRoot, root), 'Required package escapes consumer');
    const packageManifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
    assert.ok(Object.hasOwn(packageManifest.exports, name), 'Required declaration is not a public export: ' + packageName + name);
    const declarationPath = packageManifest.exports[name]?.types;
    assert.ok(typeof declarationPath === 'string' && declarationPath.startsWith('./'), 'Required public export lacks declarations');
    const declaration = realpathSync(resolve(packageRoot, declarationPath));
    assert.ok(inside(declaration, packageRoot), 'Required declaration escapes its installed package');
    return declaration;
});
const program = ts.createProgram(rootFiles, parsed.options, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => root, getCanonicalFileName: file => file, getNewLine: () => '\n' }));
const files = program.getSourceFiles().map(file => realpathSync(file.fileName));
assert.ok(files.includes(target), 'Scenario must resolve its installed declaration');
for (const declaration of requiredDeclarations)
    assert.ok(files.includes(declaration), 'Scenario must resolve every required public declaration');
const evidence = files.map(file => {
    assert.ok(inside(file, root) || inside(file, compilerLib), 'Type resolution escapes the consumer: ' + file);
    const label = inside(file, root) ? 'consumer/' + relative(root, file) : 'typescript/' + relative(compilerLib, file);
    return { path: label.split(sep).join('/'), sha256: createHash('sha256').update(readFileSync(file)).digest('hex') };
});
console.log(JSON.stringify(evidence));

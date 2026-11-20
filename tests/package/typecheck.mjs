// Generated from tests/package/typecheck.mts by npm run generate:runtime; do not edit.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
const [directory, targetName, environment, entry = '.', ...extra] = process.argv.slice(2);
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
const program = ts.createProgram([resolve(root, environment === 'node' ? 'node.ts' : 'consumer.ts')], parsed.options, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => root, getCanonicalFileName: file => file, getNewLine: () => '\n' }));
const files = program.getSourceFiles().map(file => realpathSync(file.fileName));
assert.ok(files.includes(target), 'Scenario must resolve its installed declaration');
const evidence = files.map(file => {
    assert.ok(inside(file, root) || inside(file, compilerLib), 'Type resolution escapes the consumer: ' + file);
    const label = inside(file, root) ? 'consumer/' + relative(root, file) : 'typescript/' + relative(compilerLib, file);
    return { path: label.split(sep).join('/'), sha256: createHash('sha256').update(readFileSync(file)).digest('hex') };
});
console.log(JSON.stringify(evidence));

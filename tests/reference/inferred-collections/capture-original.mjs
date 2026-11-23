// Generated from tests/reference/inferred-collections/capture-original.mts by npm run generate:runtime; do not edit.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, relative, resolve } from 'node:path';
import { portableCase } from '../../parity/normalize.mjs';
import { assertInputBytes } from '../../parity/inputs.mjs';
import { assertCaptureRecord } from './capture-records.mjs';
import { confirmReferenceCaptureCleanup, executeReferencePartitions, spawnReferenceCapture, terminateReferenceCapture } from '../../../scripts/reference/execution.mjs';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const folder = fileURLToPath(new URL('./', import.meta.url));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const encode = (value) => JSON.stringify(value);
const freeze = (value) => { if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
} ; return value; };
const registered = freeze(JSON.parse(await readFile(resolve(folder, 'inputs.json'), 'utf8')));
const expected = freeze(JSON.parse(await readFile(resolve(folder, 'original.json'), 'utf8')));
const expectedByName = new Map(expected.cases.map(row => [row.name, row]));
const partitions = 4;
assert.equal(registered.cases.length, 138);
assert.equal(expected.corpus_sha256, hash(encode(registered.cases)));
const { cases: _cases, corpus_sha256: _digest, ...expectedMetadata } = expected;
export function originalPartitionRequest(index) {
    assert.ok(Number.isInteger(index) && index >= 0 && index < partitions, 'Unknown original collection partition');
    return { cases: structuredClone(registered.cases.filter((_, position) => position % partitions === index)) };
}
export function assertOriginalPartition(part, binding) {
    const request = originalPartitionRequest(part.index);
    assert.deepEqual(part.request, request, 'Original collection registration differs');
    assert.equal(encode(part.request), encode(request), 'Original collection member order differs');
    assert.equal(part.source, binding.source, 'Parent source differs');
    assert.equal(part.executable, binding.executable, 'Python executable differs');
    const { cases, imported_module, corpus_sha256, ...metadata } = part.capture;
    assert.deepEqual(metadata, expectedMetadata, 'Original Python source or dependency metadata differs');
    assert.equal(imported_module, binding.imported_module, 'Original Python import source differs');
    assert.equal(corpus_sha256, hash(encode(request.cases)), 'Original partition input digest differs');
    assert.deepEqual(cases.map(row => row.name), request.cases.map(row => row.name), 'Original partition case identities differ');
    for (const [index, item] of request.cases.entries()) {
        assertInputBytes(item, cases[index]);
        // The registered capture contract supplies the exception and receipt fields preserved by normalization.
        assertCaptureRecord(portableCase(cases[index]), expectedByName.get(item.name));
    }
}
/** Preserve every original record and only the five existing child-order allowances. */
export function assembleOriginalCaptures(parts, binding) {
    assert.equal(parts.length, partitions, 'An original collection partition is missing');
    const indexes = new Set(), rows = new Map();
    for (const part of parts) {
        assert.ok(!indexes.has(part.index), 'An original collection partition repeats');
        indexes.add(part.index);
        assertOriginalPartition(part, binding);
        for (const row of part.capture.cases) {
            assert.ok(!rows.has(row.name), 'An original collection case repeats');
            rows.set(row.name, row);
        }
    }
    assert.equal(rows.size, registered.cases.length, 'Original collection coverage is incomplete');
    return { ...parts[0].capture, corpus_sha256: expected.corpus_sha256,
        cases: registered.cases.map(item => rows.get(item.name)) };
}
// Every copied file is byte-identical. Isolated harness roots confine the
// canonical oracle's environment receipt and temporary crates to one worker.
const harnessFiles = ['tests/reference/inferred-collections/capture.py', 'tests/reference/inferred-collections/correction.json',
    'tests/parity/oracle.py', 'tests/parity/error_nodes.py', 'tests/parity/context.json', 'tests/parity/requirements-oracle.txt',
    'scripts/reference/verify-environment.py', 'scripts/reference/dependency_integrity.py', 'docs/compatibility/reference.json'];
async function managedReferenceContext() {
    if (!process.send || !process.connected || process.platform === 'win32')
        return false;
    const owner = await new Promise(resolve => {
        const timer = setTimeout(() => { process.removeListener('message', receive); resolve(undefined); }, 1000);
        const receive = (value) => {
            if (!value || typeof value !== 'object' || !('referenceOwner' in value))
                return;
            clearTimeout(timer);
            process.removeListener('message', receive);
            resolve(Number(value.referenceOwner));
        };
        process.on('message', receive);
    });
    if (!owner || owner !== process.ppid)
        return false;
    const group = (pid) => Number(execFileSync('ps', ['-o', 'pgid=', '-p', String(pid)], { encoding: 'utf8' }).trim());
    assert.equal(group(owner), owner, 'Reference owner must lead its own process group');
    assert.equal(group(process.pid), owner, 'Managed capture must inherit its owner group');
    return true;
}
async function main() {
    const inheritedGroup = await managedReferenceContext();
    const failOwner = () => { if (inheritedGroup && process.connected)
        process.send?.('reference:cancel'); };
    const args = process.argv.slice(2);
    assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--workers' && ['2', '4'].includes(args[1])), 'Use [--workers 2|4]');
    const workers = args.length ? Number(args[1]) : 2;
    const output = resolve(root, 'artifacts/reports/inferred-collections-original.json');
    const receiptPath = resolve(root, 'artifacts/reports/inferred-collections-original-partitions.json');
    await rm(output, { force: true });
    await rm(receiptPath, { force: true });
    const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL' }).trim();
    const owner = resolve(root, 'artifacts/reports/reference-partitions', source, 'python-' + expected.python, 'inferred-collections-original');
    await mkdir(owner, { recursive: true });
    const attempt = await mkdtemp(owner + '/attempt-');
    const probe = (name, executable, args) => new Promise((accept, reject) => {
        const controller = new AbortController();
        const child = spawnReferenceCapture(executable, args, { cwd: root,
            env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, signal: controller.signal, inheritedGroup });
        let stdout = '', stderr = '';
        let failure;
        const timer = setTimeout(() => { failOwner(); controller.abort(); }, 10000);
        child.stdout.on('data', data => { stdout += data; });
        child.stderr.on('data', data => { stderr += data; });
        child.once('error', error => { failure = error; failOwner(); });
        child.once('exit', (code, signal) => { if (code !== 0 || signal)
            failOwner(); });
        child.once('close', async (code, signal) => {
            clearTimeout(timer);
            try {
                await confirmReferenceCaptureCleanup(child, inheritedGroup);
                await writeFile(resolve(attempt, name + '.stdout.json'), stdout, { flag: 'wx' });
                await writeFile(resolve(attempt, name + '.stderr.log'), stderr, { flag: 'wx' });
                await writeFile(resolve(attempt, name + '.execution.json'), encode({ executable, code, signal }) + '\n', { flag: 'wx' });
                if (failure)
                    throw failure;
                assert.equal(code, 0, 'Original capture admission failed: ' + name + ' ' + (signal ?? code));
                accept(JSON.parse(stdout));
            }
            catch (error) {
                reject(error);
            }
        });
    });
    const requestedPython = process.env.BIA_PYTHON ?? resolve(root, 'artifacts/reference/python-env/bin/python');
    const identity = await probe('interpreter', requestedPython, ['-c',
        'import json,sys; print(json.dumps({"executable":sys.executable,"python":".".join(map(str,sys.version_info[:3]))}))']);
    assert.equal(identity.python, expected.python);
    const environment = await probe('environment', identity.executable, [resolve(root, 'scripts/reference/verify-environment.py')]);
    const binding = { source, executable: identity.executable, imported_module: environment.imported_package };
    await writeFile(resolve(attempt, 'environment.json'), encode(environment) + '\n', { flag: 'wx' });
    const resources = Object.fromEntries(await Promise.all(harnessFiles.map(async (path) => [path, await readFile(resolve(root, path))])));
    const resourceHashes = Object.fromEntries(Object.entries(resources).map(([path, bytes]) => [path, hash(bytes)]));
    const sourceHashes = { runner_sha256: hash(await readFile(fileURLToPath(import.meta.url))),
        scheduler_sha256: hash(await readFile(resolve(root, 'scripts/reference/execution.mjs'))),
        owner_sha256: hash(await readFile(resolve(root, 'scripts/reference/process-owner.mjs'))),
        capture_sha256: resourceHashes['tests/reference/inferred-collections/capture.py'],
        verifier_sha256: hash(await readFile(resolve(folder, 'verify-capture.mjs'))),
        registered_inputs_sha256: hash(await readFile(resolve(folder, 'inputs.json'))), resources: resourceHashes };
    const started = performance.now();
    const run = async (index, signal) => {
        signal.throwIfAborted();
        const request = originalPartitionRequest(index), directory = resolve(attempt, String(index)), harness = resolve(directory, 'harness');
        for (const [path, bytes] of Object.entries(resources)) {
            signal.throwIfAborted();
            const destination = resolve(harness, path);
            await mkdir(dirname(destination), { recursive: true });
            await writeFile(destination, bytes, { flag: 'wx' });
            assert.equal(hash(await readFile(destination)), resourceHashes[path]);
        }
        signal.throwIfAborted();
        await mkdir(resolve(harness, 'artifacts/work'), { recursive: true });
        signal.throwIfAborted();
        await writeFile(resolve(directory, 'request.json'), encode(request), { flag: 'wx' });
        signal.throwIfAborted();
        return new Promise((accept, reject) => {
            const began = performance.now();
            const child = spawnReferenceCapture(identity.executable, [resolve(harness, 'tests/reference/inferred-collections/capture.py')], { cwd: root, env: { ...process.env, PYTHONHASHSEED: '0', PYTHONDONTWRITEBYTECODE: '1' }, signal,
                killSignal: 'SIGKILL', inheritedGroup });
            let stdout = '', stderr = '';
            let failure;
            child.stdout.on('data', data => {
                stdout += data;
                if (Buffer.byteLength(stdout) > 16 * 1024 * 1024) {
                    failure ??= new Error('Original capture exceeded 16 MiB');
                    if (inheritedGroup) {
                        failOwner();
                        child.kill('SIGTERM');
                    }
                    else
                        terminateReferenceCapture(child);
                }
            });
            child.stderr.on('data', data => { stderr += data; });
            child.once('error', error => { failure ??= error; failOwner(); });
            child.once('exit', (code, childSignal) => { if (code !== 0 || childSignal)
                failOwner(); });
            child.stdin.on('error', error => { failure ??= error; failOwner(); });
            child.once('close', async (code, childSignal) => {
                try {
                    await confirmReferenceCaptureCleanup(child, inheritedGroup);
                    await writeFile(resolve(directory, 'stdout.json'), stdout, { flag: 'wx' });
                    await writeFile(resolve(directory, 'stderr.log'), stderr, { flag: 'wx' });
                    await writeFile(resolve(directory, 'execution.json'), encode({ index, code, signal: childSignal,
                        ...binding, request_sha256: hash(encode(request)), elapsed_ms: performance.now() - began, ...sourceHashes }) + '\n', { flag: 'wx' });
                    if (failure)
                        throw failure;
                    assert.equal(code, 0, 'Original collection capture exited ' + (childSignal ?? code));
                    const part = { index, request, capture: JSON.parse(stdout), source: binding.source, executable: binding.executable };
                    assertOriginalPartition(part, binding);
                    console.error('original collection partition ' + index + ': ' + request.cases.length + ' cases in ' + Math.round(performance.now() - began) + ' ms');
                    accept(part);
                }
                catch (error) {
                    reject(error);
                }
            });
            child.stdin.end(encode(request));
        });
    };
    const parts = await executeReferencePartitions({ partitions, workers, timeout: 200000, onFailure: failOwner, run });
    const capture = assembleOriginalCaptures(parts, binding);
    const outputBytes = JSON.stringify(capture, null, 2) + '\n';
    const receipt = { ...binding, python: identity.python, ...sourceHashes, output_sha256: hash(outputBytes), workers, partitions,
        corpus_sha256: expected.corpus_sha256, cases: registered.cases.length,
        actual_executed_case_names: capture.cases.map(row => row.name), receipt_directory: relative(root, attempt), elapsed_ms: performance.now() - started };
    await writeFile(resolve(attempt, 'aggregate.json'), encode(capture) + '\n', { flag: 'wx' });
    await writeFile(resolve(attempt, 'qualification.json'), encode(receipt) + '\n', { flag: 'wx' });
    await writeFile(output, outputBytes);
    await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
    console.log(JSON.stringify(receipt, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
    main().catch(error => { console.error(error); process.exitCode = 1; });

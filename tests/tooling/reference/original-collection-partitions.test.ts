import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import type {Case, Capture, Partition} from '../../reference/inferred-collections/capture-original.mjs'
const read = async <T,>(name: string): Promise<T> => JSON.parse(await readFile(new URL('../../reference/inferred-collections/' + name, import.meta.url), 'utf8'))
const inputs = await read<{cases: Case[]}>('inputs.json'), expected = await read<Capture>('original.json')
const byName = new Map(expected.cases.map(row => [row.name, row]))
const binding = {source: 'a'.repeat(40), executable: '/pinned/python', imported_module: '/reference/src/bia_ro_crate/__init__.py'}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const parts = (): Partition[] => Array.from({length: 4}, (_, index) => {
  const cases = inputs.cases.filter((_, position) => position % 4 === index)
  return {index, source: binding.source, executable: binding.executable, request: {cases: structuredClone(cases)},
    capture: {...structuredClone(expected), imported_module: binding.imported_module, corpus_sha256: hash(cases),
      cases: cases.map(item => structuredClone(byName.get(item.name)!))}}
})

test('original collection partitions require exact registered requests and unchanged raw reports', async () => {
  const {assembleOriginalCaptures} = await import('../../reference/inferred-collections/capture-original.mjs')
  const capture = assembleOriginalCaptures(parts(), binding)
  assert.equal(capture.cases.length, 138)
  assert.deepEqual(capture.cases.map(row => row.name), inputs.cases.map(item => item.name))
  assert.equal(capture.corpus_sha256, expected.corpus_sha256)
  for (const mutate of [rows => rows.pop(), rows => {rows[1] = structuredClone(rows[0])},
    rows => {rows[0].request.cases.pop()}, rows => {rows[0].request.cases.reverse()},
    rows => {rows[0].request.cases[0].name += '/foreign'},
    rows => {rows[0].request.cases[0].files['ro-crate-metadata.json'] += '\n'},
    rows => {rows[0].request.cases[0].contexts = {'https://example.test/context': {'@context': {}}}},
    rows => {rows[0].capture.cases.pop()}, rows => {rows[0].capture.commit = 'wrong'},
    rows => {rows[0].capture.python = '3.13.11'}, rows => {rows[0].capture.imported_module = '/other/__init__.py'},
    rows => {rows[0].source = 'wrong'}, rows => {rows[0].executable = '/other/python'},
    rows => {rows[0].capture.cases[0].status = 'incomplete'},
    rows => {rows[0].capture.cases[0].inputs_sha256['ro-crate-metadata.json'] = 'wrong'},
    rows => {rows[0].capture.cases[0].report.issues.INFO!.push({message: 'extra', severity: 20, location_description: null})},
    rows => {rows[0].capture.collection_correction = {scope: 'not original'}}] satisfies Array<(rows: Partition[]) => void>) {
    const changed = parts(); mutate(changed)
    assert.throws(() => assembleOriginalCaptures(changed, binding))
  }
})

test('only the established original ExceptionGroup child permutations remain admissible', async () => {
  const {assembleOriginalCaptures} = await import('../../reference/inferred-collections/capture-original.mjs')
  const changed = parts()
  const allowed = changed.flatMap(part => part.capture.cases).find(row => row.name === 'datatype-sameas-derived')
  assert.ok(allowed?.exception)
  allowed.exception.children.reverse()
  assembleOriginalCaptures(changed, binding)
  allowed.exception.children[0].message += ' changed'
  assert.throws(() => assembleOriginalCaptures(changed, binding))
})

test('original collection deadlines cancel active captures and cannot launch later subsets', async () => {
  const {executeReferencePartitions} = await import('../../../scripts/reference/execution.mjs')
  let calls = 0, drained = 0
  await assert.rejects(executeReferencePartitions({partitions: 4, workers: 2, timeout: 25,
    run: async (_index, signal) => {
      calls++
      await new Promise<void>(resolve => signal.addEventListener('abort', () => setTimeout(() => {drained++; resolve()}, 10), {once: true}))
      return {}
    }}), error => error instanceof AggregateError && error.errors.some(item => /deadline/.test(item.message)))
  assert.equal(calls, 2); assert.equal(drained, 2)
})

test('a failed original capture drains its sibling and cannot launch later partitions', async () => {
  const {executeReferencePartitions} = await import('../../../scripts/reference/execution.mjs')
  let calls = 0, release: (() => void) | undefined, drained = false, settled = false
  const running = executeReferencePartitions({partitions: 4, workers: 2, run: async index => {
    calls++
    if (index === 0) throw new Error('capture exited 19')
    await new Promise<void>(resolve => {release = resolve}); drained = true; return {}
  }})
  void running.then(() => {settled = true}, () => {settled = true})
  await new Promise(setImmediate); assert.equal(settled, false)
  assert.ok(release); release(); await assert.rejects(running, /Reference partitions failed/)
  assert.equal(calls, 2); assert.equal(drained, true)
})

test('failed interpreter admission cannot retain a previous original success', async t => {
  const {spawnSync} = await import('node:child_process')
  const {mkdir, writeFile, rm, access} = await import('node:fs/promises')
  const {fileURLToPath} = await import('node:url')
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  await mkdir(root + '/artifacts/reports', {recursive: true})
  const paths = ['inferred-collections-original.json', 'inferred-collections-original-partitions.json']
    .map(name => root + '/artifacts/reports/' + name)
  for (const path of paths) {
    const before = await readFile(path).catch(error => {if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; return null})
    t.after(() => before === null ? rm(path, {force: true}) : writeFile(path, before))
    await writeFile(path, 'stale success')
  }
  const child = spawnSync(process.execPath, ['tests/reference/inferred-collections/capture-original.mjs'],
    {cwd: root, encoding: 'utf8', timeout: 10000,
      env: {...process.env, BIA_PYTHON: root + '/artifacts/nonexistent-python'}})
  assert.notEqual(child.status, 0)
  for (const path of paths) await assert.rejects(access(path), {code: 'ENOENT'})
})

test('aborting a Python capture kills its verifier descendant and closes inherited pipes', {skip: process.platform === 'win32'}, async t => {
  const {spawnReferenceCapture} = await import('../../../scripts/reference/execution.mjs')
  const {mkdir, mkdtemp, rm} = await import('node:fs/promises')
  const {fileURLToPath} = await import('node:url')
  const {execFileSync} = await import('node:child_process')
  const parent = fileURLToPath(new URL('../../../artifacts/work/', import.meta.url))
  await mkdir(parent, {recursive: true}); const cwd = await mkdtemp(parent + 'capture-tree-')
  t.after(() => rm(cwd, {recursive: true, force: true}))
  const controller = new AbortController()
  const code = 'import subprocess,sys,time\nchild=subprocess.Popen([sys.executable,"-c","import time; time.sleep(60)"])\nprint(child.pid,flush=True)\ntime.sleep(60)'
  const child = spawnReferenceCapture('python3', ['-c', code], {cwd, signal: controller.signal})
  assert.ok(child.pid && child.stderr && child.stdout)
  let stderr = ''; child.stderr.on('data', data => {stderr += data})
  const closed = new Promise<{code: number | null; signal: NodeJS.Signals | null}>((resolve, reject) => {child.once('error', reject); child.once('close', (code, signal) => resolve({code, signal}))})
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const descendant = await new Promise<number>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Python verifier did not start: ' + stderr)), 5000)
      child.stdout!.once('data', data => resolve(Number(String(data).trim())))
    })
    clearTimeout(timer); assert.ok(Number.isInteger(descendant) && descendant > 0)
    controller.abort()
    const result = await Promise.race([closed, new Promise<never>((_, reject) => {timer = setTimeout(() => reject(new Error('Inherited verifier pipes stayed open')), 2000)})])
    clearTimeout(timer); assert.equal(result.signal, 'SIGKILL')
    const running = (pid: number) => {
      try {return !execFileSync('ps', ['-o', 'stat=', '-p', String(pid)], {encoding: 'utf8'}).trim().startsWith('Z')}
      catch (error) {if ((error as {status?: number}).status === 1) return false; throw error}
    }
    assert.equal(running(child.pid!), false); assert.equal(running(descendant), false)
  } finally {clearTimeout(timer); controller.abort()}
})

for (const failure of ['overflow', 'partition', 'admission'] as const) test(`managed original capture ${failure} stops its active workers before returning`, {skip: process.platform === 'win32'}, async t => {
  const {mkdir, mkdtemp, writeFile, rm, access, chmod} = await import('node:fs/promises')
  const {fileURLToPath} = await import('node:url')
  const {runReferenceStep} = await import('../../../scripts/reference/execution.mjs')
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  const parent = root + '/artifacts/work/'
  await mkdir(parent, {recursive: true}); const cwd = await mkdtemp(parent + 'managed-overflow-')
  t.after(() => rm(cwd, {recursive: true, force: true}))
  const executable = cwd + '/python'
  const script = `#!/usr/bin/env node
import fs from 'node:fs'
import {spawn} from 'node:child_process'
const dir = ${JSON.stringify(cwd)}
const failure = ${JSON.stringify(failure)}
const descendant = () => {
  const source = "import fs from 'node:fs'; const dir = " + JSON.stringify(dir) + "; fs.appendFileSync(dir + '/descendants', process.pid + String.fromCharCode(10)); setTimeout(() => {if (!fs.existsSync(dir + '/stop')) fs.writeFileSync(dir + '/late', 'late')}, 3000)"
  spawn(process.execPath, ['--input-type=module', '--eval', source], {stdio: 'ignore'})
}
if (process.argv[2] === '-c' && failure === 'admission') {descendant(); setTimeout(() => process.exit(19), 250)}
else if (process.argv[2] === '-c') console.log(JSON.stringify({executable: process.argv[1], python: '3.13.12'}))
else if (process.argv[2].endsWith('verify-environment.py')) console.log(JSON.stringify({imported_package: '/reference/package'}))
else {
  process.stdin.resume()
  fs.appendFileSync(dir + '/started', process.pid + '\\n')
  descendant()
  if (failure === 'overflow') setTimeout(() => {for (let i = 0; i < 20; i++) process.stdout.write('x'.repeat(1024 * 1024))}, 250)
  else if (process.argv[2].includes('/0/')) setTimeout(() => process.exit(19), 250)
  setInterval(() => {}, 1000)
}
`
  await writeFile(executable, script); await chmod(executable, 0o755)
  try {
    await assert.rejects(runReferenceStep({command: process.execPath,
      args: ['tests/reference/inferred-collections/capture-original.mjs'], managed: 'original-collections', env: {BIA_PYTHON: executable}},
    {cwd: root, timeout: 10000}), /failed/)
    if (failure === 'admission') await assert.rejects(access(cwd + '/started'), {code: 'ENOENT'})
    else {
      const started = (await readFile(cwd + '/started', 'utf8')).trim().split('\n')
      assert.equal(started.length, 2, 'failure must prevent later partitions')
    }
    const descendants = (await readFile(cwd + '/descendants', 'utf8')).trim().split('\n').map(Number)
    assert.ok(descendants.length > 0 && descendants.every(pid => Number.isInteger(pid) && pid > 1))
    const {execFileSync} = await import('node:child_process')
    for (const pid of descendants) {
      let state = ''
      try {state = execFileSync('ps', ['-o', 'stat=', '-p', String(pid)], {encoding: 'utf8'}).trim()}
      catch (error) {if ((error as {status?: number}).status !== 1) throw error}
      assert.ok(!state || state.startsWith('Z'), `descendant ${pid} is still executing`)
    }
    await assert.rejects(access(cwd + '/late'), {code: 'ENOENT'})
  } finally {await writeFile(cwd + '/stop', 'stop')}
})

test('standalone capture preserves successful and nonzero command exits', {skip: process.platform === 'win32'}, async () => {
  const {spawnReferenceCapture, confirmReferenceCaptureCleanup} = await import('../../../scripts/reference/execution.mjs')
  for (const status of [0, 19]) {
    const child = spawnReferenceCapture(process.execPath, ['-e', `process.exit(${status})`], {})
    const actual = await new Promise<number | null>((resolve, reject) => {child.once('error', reject); child.once('close', resolve)})
    await confirmReferenceCaptureCleanup(child)
    assert.equal(actual, status)
  }
})

test('standalone capture reports an executable spawn error', {skip: process.platform === 'win32'}, async () => {
  const {spawnReferenceCapture, confirmReferenceCaptureCleanup} = await import('../../../scripts/reference/execution.mjs')
  const child = spawnReferenceCapture('/nonexistent-reference-command', [], {})
  const error = await new Promise<NodeJS.ErrnoException>((resolve, reject) => {
    child.once('error', resolve); child.once('close', () => reject(new Error('spawn failure was not reported')))
  })
  assert.equal(error.code, 'ENOENT')
  await new Promise<void>(resolve => child.once('close', () => resolve()))
  await confirmReferenceCaptureCleanup(child)
})

test('standalone capture aborts before startup', {skip: process.platform === 'win32'}, async () => {
  const {spawnReferenceCapture, confirmReferenceCaptureCleanup} = await import('../../../scripts/reference/execution.mjs')
  const controller = new AbortController(); controller.abort()
  const child = spawnReferenceCapture(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {signal: controller.signal})
  const closed = await new Promise<NodeJS.Signals | null>((resolve, reject) => {child.once('error', reject); child.once('close', (_status, signal) => resolve(signal))})
  await confirmReferenceCaptureCleanup(child)
  assert.equal(closed, 'SIGKILL')
})

test('standalone capture aborts descendants after their direct parent exits', {skip: process.platform === 'win32'}, async () => {
  const {spawnReferenceCapture, confirmReferenceCaptureCleanup} = await import('../../../scripts/reference/execution.mjs')
  const controller = new AbortController()
  const source = "const {spawn}=require('node:child_process'); spawn(process.execPath,['-e',\"console.log(process.pid); setInterval(() => {}, 1000)\"],{stdio:'inherit'}); process.exit(0)"
  const child = spawnReferenceCapture(process.execPath, ['-e', source], {signal: controller.signal})
  const closed = new Promise<NodeJS.Signals | null>((resolve, reject) => {child.once('error', reject); child.once('close', (_status, signal) => resolve(signal))})
  const pid = await new Promise<number>((resolve, reject) => {child.stdout!.once('data', data => resolve(Number(String(data).trim()))); child.once('error', reject)})
  assert.ok(Number.isInteger(pid) && pid > 1)
  await new Promise(resolve => setTimeout(resolve, 100))
  controller.abort()
  assert.equal(await closed, 'SIGKILL')
  await confirmReferenceCaptureCleanup(child)
})

test('standalone capture reports a lost owner without waiting indefinitely for descendants', {skip: process.platform === 'win32'}, async () => {
  const {spawnReferenceCapture, confirmReferenceCaptureCleanup} = await import('../../../scripts/reference/execution.mjs')
  const child = spawnReferenceCapture(process.execPath, ['-e', "process.kill(process.ppid, 'SIGKILL'); setTimeout(() => process.exit(0), 3500)"], {})
  let failure: Error | undefined
  child.on('error', error => {failure ??= error})
  const started = Date.now()
  await new Promise<void>(resolve => child.once('close', () => resolve()))
  await assert.rejects(confirmReferenceCaptureCleanup(child), /cleanup could not be confirmed/)
  assert.match(failure?.message ?? '', /owner exited/)
  assert.ok(Date.now() - started < 4000)
})

test('partition receipt verification rejects stale scheduler bytes and a different capture', async t => {
  const {mkdir, mkdtemp, writeFile, rm} = await import('node:fs/promises')
  const {fileURLToPath} = await import('node:url')
  const {execFileSync, spawnSync} = await import('node:child_process')
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  await mkdir(root + '/artifacts/work/', {recursive: true})
  const cwd = await mkdtemp(root + '/artifacts/work/reference-receipt-')
  t.after(() => rm(cwd, {recursive: true, force: true}))
  const digest = async (path: string) => createHash('sha256').update(await readFile(root + '/' + path)).digest('hex')
  const capture = 'tests/reference/inferred-collections/original.json'
  const receipt = {source: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(),
    scheduler_sha256: await digest('scripts/reference/execution.mjs'), owner_sha256: await digest('scripts/reference/process-owner.mjs'),
    output_sha256: await digest(capture)}
  const receiptPath = cwd + '/receipt.json'
  const verify = () => spawnSync(process.execPath, ['tests/reference/inferred-collections/verify-capture.mjs', 'original', capture, '--receipt', receiptPath], {cwd: root, encoding: 'utf8'})
  await writeFile(receiptPath, JSON.stringify(receipt))
  assert.equal(verify().status, 0)
  await writeFile(receiptPath, JSON.stringify({...receipt, scheduler_sha256: '0'.repeat(64)}))
  assert.notEqual(verify().status, 0)
  await writeFile(receiptPath, JSON.stringify({...receipt, output_sha256: '0'.repeat(64)}))
  assert.notEqual(verify().status, 0)
  await writeFile(receiptPath, JSON.stringify({...receipt, source: '0'.repeat(40)}))
  assert.notEqual(verify().status, 0)
})

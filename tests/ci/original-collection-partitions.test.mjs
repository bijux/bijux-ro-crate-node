import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const read = async name => JSON.parse(await readFile(new URL('../reference/inferred-collections/' + name, import.meta.url)))
const inputs = await read('inputs.json'), expected = await read('original.json')
const byName = new Map(expected.cases.map(row => [row.name, row]))
const binding = {source: 'a'.repeat(40), executable: '/pinned/python', imported_module: '/reference/src/bia_ro_crate/__init__.py'}
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const parts = () => Array.from({length: 4}, (_, index) => {
  const cases = inputs.cases.filter((_, position) => position % 4 === index)
  return {index, source: binding.source, executable: binding.executable, request: {cases: structuredClone(cases)},
    capture: {...structuredClone(expected), imported_module: binding.imported_module, corpus_sha256: hash(cases),
      cases: cases.map(item => structuredClone(byName.get(item.name)))}}
})

test('original collection partitions require exact registered requests and unchanged raw reports', async () => {
  const {assembleOriginalCaptures} = await import('../reference/inferred-collections/capture-original.mjs')
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
    rows => {rows[0].capture.cases[0].report.issues.INFO.push({message: 'extra', severity: 20, location_description: null})},
    rows => {rows[0].capture.collection_correction = {scope: 'not original'}}]) {
    const changed = parts(); mutate(changed)
    assert.throws(() => assembleOriginalCaptures(changed, binding))
  }
})

test('only the established original ExceptionGroup child permutations remain admissible', async () => {
  const {assembleOriginalCaptures} = await import('../reference/inferred-collections/capture-original.mjs')
  const changed = parts()
  const allowed = changed.flatMap(part => part.capture.cases).find(row => row.name === 'datatype-sameas-derived')
  allowed.exception.children.reverse()
  assembleOriginalCaptures(changed, binding)
  allowed.exception.children[0].message += ' changed'
  assert.throws(() => assembleOriginalCaptures(changed, binding))
})

test('original collection deadlines cancel active captures and cannot launch later subsets', async () => {
  const {executeReferencePartitions} = await import('../../scripts/ci/reference-execution.mjs')
  let calls = 0, drained = 0
  await assert.rejects(executeReferencePartitions({partitions: 4, workers: 2, timeout: 25,
    run: async (_index, signal) => {
      calls++
      await new Promise(resolve => signal.addEventListener('abort', () => setTimeout(() => {drained++; resolve()}, 10), {once: true}))
      return {}
    }}), error => error instanceof AggregateError && error.errors.some(item => /deadline/.test(item.message)))
  assert.equal(calls, 2); assert.equal(drained, 2)
})

test('a failed original capture drains its sibling and cannot launch later partitions', async () => {
  const {executeReferencePartitions} = await import('../../scripts/ci/reference-execution.mjs')
  let calls = 0, release, drained = false, settled = false
  const running = executeReferencePartitions({partitions: 4, workers: 2, run: async index => {
    calls++
    if (index === 0) throw new Error('capture exited 19')
    await new Promise(resolve => {release = resolve}); drained = true; return {}
  }})
  void running.then(() => {settled = true}, () => {settled = true})
  await new Promise(setImmediate); assert.equal(settled, false)
  release(); await assert.rejects(running, /Reference partitions failed/)
  assert.equal(calls, 2); assert.equal(drained, true)
})

test('failed interpreter admission cannot retain a previous original success', async t => {
  const {spawnSync} = await import('node:child_process')
  const {mkdir, writeFile, rm, access} = await import('node:fs/promises')
  const {fileURLToPath} = await import('node:url')
  const root = fileURLToPath(new URL('../../', import.meta.url))
  await mkdir(root + '/artifacts/reports', {recursive: true})
  const paths = ['inferred-collections-original.json', 'inferred-collections-original-partitions.json']
    .map(name => root + '/artifacts/reports/' + name)
  for (const path of paths) {
    const before = await readFile(path).catch(error => {if (error.code !== 'ENOENT') throw error; return null})
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
  const {spawnReferenceCapture} = await import('../../scripts/ci/reference-execution.mjs')
  const {mkdir, mkdtemp, rm} = await import('node:fs/promises')
  const {fileURLToPath} = await import('node:url')
  const {execFileSync} = await import('node:child_process')
  const parent = fileURLToPath(new URL('../../artifacts/work/', import.meta.url))
  await mkdir(parent, {recursive: true}); const cwd = await mkdtemp(parent + 'capture-tree-')
  t.after(() => rm(cwd, {recursive: true, force: true}))
  const controller = new AbortController()
  const code = 'import subprocess,sys,time\nchild=subprocess.Popen([sys.executable,"-c","import time; time.sleep(60)"])\nprint(child.pid,flush=True)\ntime.sleep(60)'
  const child = spawnReferenceCapture('python3', ['-c', code], {cwd, signal: controller.signal})
  t.after(() => {try {process.kill(-child.pid, 'SIGKILL')} catch (error) {if (error.code !== 'ESRCH') throw error}})
  let stderr = ''; child.stderr.on('data', data => {stderr += data})
  const closed = new Promise((resolve, reject) => {child.once('error', reject); child.once('close', (code, signal) => resolve({code, signal}))})
  let timer
  try {
    const descendant = await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Python verifier did not start: ' + stderr)), 5000)
      child.stdout.once('data', data => resolve(Number(String(data).trim())))
    })
    clearTimeout(timer); assert.ok(Number.isInteger(descendant) && descendant > 0)
    controller.abort()
    const result = await Promise.race([closed, new Promise((_, reject) => {timer = setTimeout(() => reject(new Error('Inherited verifier pipes stayed open')), 2000)})])
    clearTimeout(timer); assert.equal(result.signal, 'SIGKILL')
    const running = pid => {
      try {return !execFileSync('ps', ['-o', 'stat=', '-p', String(pid)], {encoding: 'utf8'}).trim().startsWith('Z')}
      catch (error) {if (error.status === 1) return false; throw error}
    }
    assert.equal(running(child.pid), false); assert.equal(running(descendant), false)
  } finally {clearTimeout(timer); controller.abort()}
})

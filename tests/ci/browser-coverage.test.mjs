import assert from 'node:assert/strict'
import test from 'node:test'
import {createHash} from 'node:crypto'
import {execFileSync, spawnSync} from 'node:child_process'
import {mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {makeCases} from '../parity/cases.mjs'
import {cases as literals} from '../reference/literal-grammar/checks.mjs'
import {cases as processing} from '../reference/jsonld-processing/checks.mjs'
import {cases as collections} from '../reference/inferred-collections/checks.mjs'
import {cases as diagnostics} from '../reference/collection-diagnostics/checks.mjs'

test('browser admission accepts all registered suites and rejects missing or unexpected receipts', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const work = new URL('../../artifacts/work/', import.meta.url)
  await mkdir(work, {recursive: true})
  const directory = await mkdtemp(fileURLToPath(new URL('browser-coverage-', work)))
  const output = new URL('../../artifacts/reports/browser-coverage.json', import.meta.url)
  const previous = await readFile(output).catch(error => {if (error.code !== 'ENOENT') throw error; return null})
  try {
    const all = await makeCases(), explicit = []
    for (const name of (await readdir(new URL('../parity/inputs/', import.meta.url))).sort())
      explicit.push(...JSON.parse(await readFile(new URL('../parity/inputs/' + name, import.meta.url))).cases)
    explicit.push(...all.filter(item => item.name.startsWith('manifest/inference-chunks/')))
    const suites = [['browser-parity', all], ['session-continuation', explicit],
      ['literal-grammar', literals], ['jsonld-processing', processing],
      ['inferred-collections', collections], ['collection-diagnostics', diagnostics]]
    const source = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim()
    const documents = []
    for (const distribution of ['source', 'installed']) {
      const base = distribution === 'source' ? '/packages/validator/dist/' :
        '/artifacts/consumers/validator/node_modules/@bijux/ro-crate-validator/dist/'
      const core = distribution === 'source' ? '/packages/core/dist/' :
        '/artifacts/consumers/validator/node_modules/@bijux/ro-crate-core/dist/'
      documents.push({distribution, workerPath: base + 'worker.js', browserPath: base + 'browser.js',
        corePath: core + 'index.js', reports: ['chromium', 'firefox', 'webkit'].flatMap(engine =>
          suites.map(([suite, cases]) => ({engine, total: cases.length, passed: cases.length,
            actual_executed_case_names: cases.map(item => item.name), selection: {suite,
              source_sha: source, case_set_sha256: createHash('sha256').update(JSON.stringify(cases)).digest('hex'),
              full_case_count: cases.length, shard: {index: 0, total: 1}, case_names: cases.map(item => item.name)}})))})
    }
    const run = async rows => {
      for (const [index, document] of rows.entries()) await writeFile(directory + '/' + index + '.json', JSON.stringify(document))
      return spawnSync(process.execPath, ['tests/ci/verify-coverage.mjs', 'browser', directory, '1'],
        {cwd: root, encoding: 'utf8', timeout: 15000, maxBuffer: 2e6})
    }
    const complete = await run(documents)
    assert.equal(complete.status, 0, complete.stderr)
    assert.equal(JSON.parse(complete.stdout).length, 36)
    const missing = structuredClone(documents)
    missing[0].reports = missing[0].reports.filter(row => row.selection.suite !== 'jsonld-processing')
    assert.notEqual((await run(missing)).status, 0)
    const extra = structuredClone(documents)
    extra[0].reports.push({...extra[0].reports[0], selection: {...extra[0].reports[0].selection, suite: 'unregistered-suite'}})
    assert.notEqual((await run(extra)).status, 0)
  } finally {
    await rm(directory, {recursive: true, force: true})
    if (previous) await writeFile(output, previous)
    else await rm(output, {force: true})
  }
})

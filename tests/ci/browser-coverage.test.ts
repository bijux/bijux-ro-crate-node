import assert from 'node:assert/strict'
import test from 'node:test'
import {createHash} from 'node:crypto'
import {execFileSync, spawnSync} from 'node:child_process'
import {mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import type {SelectionReceipt} from '../support/selection.mjs'
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
  const previous = await readFile(output).catch(error => {if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; return null})
  try {
    const all = await makeCases(), explicit: Array<{name: string}> = []
    for (const name of (await readdir(new URL('../parity/inputs/', import.meta.url))).sort())
      explicit.push(...(JSON.parse(await readFile(new URL('../parity/inputs/' + name, import.meta.url), 'utf8')) as {cases: Array<{name: string}>}).cases)
    explicit.push(...all.filter(item => item.name.startsWith('manifest/inference-chunks/')))
    const suites: Array<[string, readonly {name: string}[]]> = [['browser-parity', all], ['session-continuation', explicit],
      ['literal-grammar', literals], ['jsonld-processing', processing],
      ['inferred-collections', collections], ['collection-diagnostics', diagnostics]]
    const source = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim()
    const documents: Array<{distribution: string; workerPath: string; browserPath: string; corePath: string; reports: Array<{engine: string; total: number; passed: number; actual_executed_case_names: string[]; selection: SelectionReceipt}>}> = []
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
    const run = async (rows: typeof documents) => {
      for (const [index, document] of rows.entries()) await writeFile(directory + '/' + index + '.json', JSON.stringify(document))
      return spawnSync(process.execPath, ['tests/ci/verify-coverage.mjs', 'browser', directory, '1'],
        {cwd: root, encoding: 'utf8', timeout: 15000, maxBuffer: 2e6})
    }
    const complete = await run(documents)
    assert.equal(complete.status, 0, complete.stderr)
    assert.equal(JSON.parse(complete.stdout).length, 36)
    const attempts = directory + '/attempts'
    await mkdir(attempts)
    for (const engine of ['chromium', 'firefox', 'webkit']) {
      const name = `browser-corpus-${engine}-0-attempt-1`
      await mkdir(attempts + '/' + name)
      for (const [index, document] of documents.entries())
        await writeFile(`${attempts}/${name}/${index}.json`, JSON.stringify({...document, reports: document.reports.filter(row => row.engine === engine)}))
    }
    const latest = attempts + '/browser-corpus-firefox-0-attempt-2'
    await mkdir(latest)
    for (const [index, document] of documents.entries())
      await writeFile(`${latest}/${index}.json`, JSON.stringify({...document, reports: document.reports.filter(row => row.engine === 'firefox').slice(0, 3)}))
    const runAttempts = () => spawnSync(process.execPath, ['tests/ci/verify-coverage.mjs', 'browser', attempts, '1', 'browser-corpus'],
      {cwd: root, env: {...process.env, GITHUB_RUN_ATTEMPT: '2'}, encoding: 'utf8', timeout: 15000, maxBuffer: 2e6})
    const incomplete = runAttempts()
    assert.notEqual(incomplete.status, 0, 'A partial newest artifact must not fall back to an older complete artifact')
    assert.match(incomplete.stderr, /Missing or unexpected browser coverage reports/)
    for (const [index, document] of documents.entries())
      await writeFile(`${latest}/${index}.json`, JSON.stringify({...document, reports: document.reports.filter(row => row.engine === 'firefox')}))
    const latestComplete = runAttempts()
    assert.equal(latestComplete.status, 0, latestComplete.stderr)
    assert.match(latestComplete.stderr, /browser-corpus-firefox-0-attempt-2/)
    assert.doesNotMatch(latestComplete.stderr, /browser-corpus-firefox-0-attempt-1/)
    const wrongProducer = structuredClone(documents[0])
    wrongProducer.reports = wrongProducer.reports.filter(row => row.engine === 'firefox')
    wrongProducer.reports[0].selection.shard.index = 1
    await writeFile(`${latest}/0.json`, JSON.stringify(wrongProducer))
    const misplaced = runAttempts()
    assert.notEqual(misplaced.status, 0)
    assert.match(misplaced.stderr, /another producer shard/)
    await rm(attempts, {recursive: true, force: true})
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

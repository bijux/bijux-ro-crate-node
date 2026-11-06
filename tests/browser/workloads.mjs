import {makeWorkloadCases} from '../parity/workload-cases.mjs'
import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {readFile, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import os from 'node:os'
import {chromium, firefox, webkit} from 'playwright'
import {serve, root} from './host.mjs'

const execute = promisify(execFile)
async function ownedRSS() {
  if (process.platform === 'win32') return null
  const {stdout} = await execute('ps', ['-axo', 'pid=,ppid=,rss=,comm='])
  const rows = stdout.trim().split('\n').map(line => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/)
    return match ? {pid: +match[1], parent: +match[2], rss: +match[3] * 1024, command: match[4]} : null
  }).filter(Boolean)
  const owned = new Set([process.pid])
  for (let changed = true; changed;) {
    changed = false
    for (const row of rows) if (owned.has(row.parent) && !owned.has(row.pid)) {owned.add(row.pid); changed = true}
  }
  return rows.filter(row => owned.has(row.pid) && !/\/ps$/.test(row.command)).reduce((sum, row) => sum + row.rss, 0)
}

const fixture = resolve(root, 'tests/parity/fixtures/test_minimal_valid_ro_crate')
const metadata = await readFile(resolve(fixture, 'ro-crate-metadata.json'), 'utf8')
const workloadCases = makeWorkloadCases({files: {'ro-crate-metadata.json': metadata}})
const heavyMetadata = workloadCases[0].files['ro-crate-metadata.json']
const large = workloadCases[0].files['file_list.tsv']
const wide = {metadata: workloadCases[2].files['ro-crate-metadata.json'], table: workloadCases[2].files['file_list.tsv']}
const rows = 100000
const host = await serve()
const reports = []
try {
  for (const [name, engine] of Object.entries({chromium, firefox, webkit})) {
    const browser = await engine.launch({headless: true})
    let sampler
    try {
      const page = await browser.newPage()
      await page.goto(host.origin + '/examples/submission/index.html')
      await page.getByLabel('Choose crate folder').setInputFiles(fixture)
      await page.waitForFunction(() => document.querySelector('#result').dataset.state === 'valid')
      const before = await ownedRSS()
      let peak = before
      sampler = setInterval(() => {ownedRSS().then(value => {if (value !== null) peak = Math.max(peak ?? 0, value)}).catch(() => {})}, 100)
      const latencies = []
      for (let index = 0; index < 8; index++) {
        latencies.push(await page.evaluate(async ({metadata, index}) => {
          const documentValue = JSON.parse(metadata)
          documentValue['@graph'].find(item => item['@id'] === './').description = 'Measured edit ' + index
          const input = document.querySelector('#metadata-editor')
          return new Promise((resolve, reject) => {
            const start = performance.now()
            const observer = new MutationObserver(() => {
              if (document.querySelector('#result').dataset.state === 'valid') {
                clearTimeout(timeout); observer.disconnect(); resolve(performance.now() - start)
              }
            })
            const timeout = setTimeout(() => {observer.disconnect(); reject(new Error('Edit feedback exceeded budget'))}, 60000)
            observer.observe(document.querySelector('#result'), {attributes: true, attributeFilter: ['data-state']})
            input.value = JSON.stringify(documentValue)
            input.dispatchEvent(new Event('input', {bubbles: true}))
          })
        }, {metadata, index}))
      }
      const work = await page.evaluate(async ({metadata, large, wide}) => {
        const worker = new Worker('/packages/validator/dist/worker.js', {type: 'module'})
        async function run(id, table, inputMetadata = metadata) {
          const start = performance.now()
          const result = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Manifest workload exceeded budget')), 60000)
            worker.onmessage = ({data}) => {clearTimeout(timeout); resolve(data.result)}
            worker.onerror = event => {clearTimeout(timeout); reject(new Error(event.message))}
            worker.postMessage({session: 'workload', revision: id, id, files: new Map([
              ['ro-crate-metadata.json', inputMetadata], ['file_list.tsv', table],
            ])})
          })
          return {status: result.status, elapsed_ms: performance.now() - start}
        }
        try {return {valid: await run(1, large), invalid_tail: await run(2, large + 'last.tif\t#missing-dataset\n'), wide: await run(3, wide.table, wide.metadata)}}
        finally {worker.terminate()}
      }, {metadata: heavyMetadata, large, wide})
      assert.equal(work.valid.status, 'valid')
      assert.equal(work.invalid_tail.status, 'invalid')
      assert.equal(work.wide.status, 'valid')
      const sorted = [...latencies].sort((a, b) => a - b)
      const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]
      reports.push({engine: name, version: browser.version(), debounce_ms: 250, edit_samples_ms: latencies,
        edit_median_ms: sorted[Math.floor(sorted.length / 2)], edit_p95_ms: p95, meets_provisional_one_second_budget: p95 <= 1000,
        manifest_rows: rows, manifest_columns: 2, wide_rows: 2000, wide_columns: 32, manifest_bytes: new TextEncoder().encode(large).length,
        workloads: work, owned_process_tree_rss_before: before, owned_process_tree_rss_peak: peak,
        memory_method: '100 ms samples of summed RSS for this Node harness and its owned browser process descendants; shared pages may be counted more than once; not worker heap or a guaranteed peak.'})
      console.log(JSON.stringify(reports.at(-1)))
    } finally {clearInterval(sampler); await browser.close()}
  }
} finally {
  await host.close()
  await writeFile(root + '/artifacts/reports/workloads.json', JSON.stringify({machine: {platform: os.platform(), release: os.release(),
    arch: os.arch(), cpus: os.cpus().length, total_memory_bytes: os.totalmem()}, reports}, null, 2) + '\n')
}

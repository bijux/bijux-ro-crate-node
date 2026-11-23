import assert from 'node:assert/strict'
import {readFile, writeFile, mkdir, readdir} from 'node:fs/promises'
import {spawnSync, execFileSync} from 'node:child_process'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {assertSnapshot as checkSnapshot, assertContract as checkContract, assertQualification as checkQualification, assertReleaseQualifications as checkReleaseQualifications, type Snapshot, type ContractReport, type Qualification} from './source-contracts.mjs'
import {releaseNodes, admittedNodes} from './runtime-policy.mjs'
import {fingerprintSourceInputs} from './source-inputs.mjs'
import {sourceInputsVersion} from './source-contracts.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))

async function prepareEnvironment(inputsSha256: string) {
  const [{makeCases}, partitions, upstream, reserved, processing, prefixes] = await Promise.all([
    import('../parity/cases.mjs'), import('../parity/snapshot-partitions.mjs'),
    import('../reference/upstream-defects/checks.mjs'), import('../reference/reserved-type-identifiers/observers/checks.mjs'),
    import('../reference/jsonld-processing/checks.mjs'), import('../reference/model-type-prefixes/checks.mjs'),
  ])
  const sourceModule = new URL('../../packages/validator/src/index.ts', import.meta.url).href
  const sourceModuleHash = createHash('sha256').update(await readFile(new URL(sourceModule))).digest('hex')
  const all = await makeCases()
  const corpus = createHash('sha256').update(JSON.stringify(all)).digest('hex')
  const source = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim()
  const suites = [
    {name: 'upstream', path: 'tests/reference/upstream-defects/run.mjs', contract: upstream},
    {name: 'reserved-types', path: 'tests/reference/reserved-type-identifiers/observers/run.mjs', contract: reserved,
      outcomes: {valid: 0, invalid: 6, incomplete: 0}},
    {name: 'jsonld-processing', path: 'tests/reference/jsonld-processing/run.mjs', contract: processing,
      outcomes: {valid: 4, invalid: 37, incomplete: 39}},
    {name: 'model-type-prefixes', path: 'tests/reference/model-type-prefixes/run.mjs', contract: prefixes,
      outcomes: {valid: 5, invalid: 15, incomplete: 0}},
  ]
  const expected = {source, inputsSha256, sourceModule, corpus, names: all.map(item => item.name), nodes: admittedNodes,
    releaseNodes, reference: upstream.reference.reference, suites}
  const snapshot = (report: Snapshot, node: string) => {
    checkSnapshot(report, node, expected)
    partitions.assertSnapshotPartitions(report, all, {source, module: sourceModule, module_sha256: sourceModuleHash,
      node, executable: report.node_executable, reference: upstream.reference.reference})
  }
  return {source, suites, expected, snapshot}
}

function run<T>(path: string, args: string[] = []): T {
  const child = spawnSync(process.execPath, ['--import', 'tsx', path, ...args], {cwd: root,
    env: process.env, encoding: 'utf8', timeout: 240000, killSignal: 'SIGKILL', maxBuffer: 16 * 1024 * 1024})
  assert.equal(child.status, 0, [child.error?.message, child.stderr, child.stdout].filter(Boolean).join('\n') ||
    'Source qualification failed')
  return JSON.parse(child.stdout) as T
}

async function main() {
  const [mode, ...extra] = process.argv.slice(2)
  assert.ok(!extra.length && [undefined, '--upstream', '--verify'].includes(mode), 'Use [--upstream|--verify]')
  assert.ok(!Object.hasOwn(process.env, 'BIJUX_VALIDATOR_MODULE'), 'Source qualification owns the validator binding')
  assert.ok(!Object.hasOwn(process.env, 'BIJUX_TEST_SHARD'), 'Source qualification must execute every case')
  const inputsSha256 = await fingerprintSourceInputs(root)
  const assertInputsUnchanged = async () => assert.equal(await fingerprintSourceInputs(root), inputsSha256, 'Source qualification inputs changed during execution')
  const {source, suites, expected, snapshot: assertSnapshot} = await prepareEnvironment(inputsSha256)
  const assertContract = (name: string, report: ContractReport, node: string) => checkContract(name, report, node, expected)
  const assertQualification = (report: Qualification, node: string) => { checkQualification(report, node, expected); assertSnapshot(report.snapshot, node) }
  const assertReleaseQualifications = (reports: Qualification[]) => { checkReleaseQualifications(reports, expected); for (const report of reports) assertSnapshot(report.snapshot, report.node_version) }
  if (mode === '--verify') {
    const directory = resolve(root, 'artifacts/reports/qualification/source')
    const files = (await readdir(directory, {recursive: true})).filter(path => path.endsWith('.json')).sort()
    const reports = await Promise.all(files.map(async path => JSON.parse(await readFile(resolve(directory, path), 'utf8')) as Qualification))
    assertReleaseQualifications(reports)
    await assertInputsUnchanged()
    console.log('Both source Node qualifications match this source and every required case')
    return
  }
  assert.equal(process.versions.node, process.env.BIJUX_TEST_NODE, 'Source qualification must run the selected Node executable')
  const node = process.versions.node
  assert.ok(admittedNodes.includes(node), 'Source qualification requires a pinned Node version')
  await mkdir(resolve(root, 'artifacts/reports'), {recursive: true})
  if (mode === '--upstream') {
    const report = run<ContractReport>(suites[0].path)
    assertContract('upstream', report, node)
    await assertInputsUnchanged()
    await writeFile(resolve(root, `artifacts/reports/source-upstream-node${node.split('.')[0]}.json`), JSON.stringify(report, null, 2) + '\n')
    console.log(JSON.stringify(report))
    return
  }
  const snapshot = run<Snapshot>('tests/parity/snapshot-partitions.mjs')
  assertSnapshot(snapshot, node)
  const contracts = suites.map(item => {
    const report = run<ContractReport>(item.path)
    assertContract(item.name, report, node)
    return {suite: item.name, report}
  })
  await assertInputsUnchanged()
  const report = {inputs_version: sourceInputsVersion, inputs_sha256: inputsSha256, source_sha: source, node_version: node, snapshot, contracts}
  assertQualification(report, node)
  await writeFile(resolve(root, `artifacts/reports/source-package-node${node.split('.')[0]}.json`), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({source_sha: source, node_version: node, ordinary_exact: snapshot.ordinary_exact_passed, qualified_collections: snapshot.qualified_collection_passed,
    contracts: contracts.map(item => ({suite: item.suite, cases: item.report.cases}))}))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()

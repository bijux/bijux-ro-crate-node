import assert from 'node:assert/strict'
import {execFileSync, spawnSync} from 'node:child_process'
import {copyFile, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL, fileURLToPath} from 'node:url'
import test, {type TestContext} from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const name = 'upstream/test_duplicate_entity_id'

async function isolatedRunner(t: TestContext) {
  await mkdir(resolve(root, 'artifacts/work'), {recursive: true})
  const directory = await mkdtemp(resolve(root, 'artifacts/work/parity-runner-'))
  t.after(() => rm(directory, {recursive: true, force: true}))
  await mkdir(resolve(directory, 'tests/ci'), {recursive: true})
  await cp(resolve(root, 'tests/parity'), resolve(directory, 'tests/parity'), {recursive: true})
  await copyFile(resolve(root, 'tests/ci/selection.mjs'), resolve(directory, 'tests/ci/selection.mjs'))
  await symlink(resolve(root, 'tests/reference'), resolve(directory, 'tests/reference'))
  for (const name of ['docs', 'packages', 'node_modules']) await symlink(resolve(root, name), resolve(directory, name))
  const gitDirectory = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {cwd: root, encoding: 'utf8'}).trim()
  await writeFile(resolve(directory, '.git'), 'gitdir: ' + gitDirectory + '\n')
  return directory
}

test('focused parity runs exactly one case and refuses snapshot recording', async t => {
  const directory = await isolatedRunner(t)
  const run = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'tests/parity/run.mjs', ...args],
    {cwd: directory, encoding: 'utf8', timeout: 30000})
  const selected = run('--snapshot', '--case=' + name)
  assert.equal(selected.status, 0, selected.stderr)
  const report = JSON.parse(selected.stdout)
  assert.deepEqual(report.actual_executed_case_names, [name])
  assert.equal(report.selection.focused_case, name)
  const record = run('--record', '--case=' + name)
  assert.notEqual(record.status, 0)
  assert.match(record.stderr, /Record the complete corpus/)
  const malformed = run('--snapshot', '--oracle-only', '--case')
  assert.notEqual(malformed.status, 0)
  assert.match(malformed.stderr, /Use --case=/)
  const missing = run('--snapshot', '--case=not-a-case')
  assert.notEqual(missing.status, 0)
  assert.match(missing.stderr, /Unknown exact case/)
})

test('parity failure gives a reproduction command and preserves full details', async t => {
  const directory = await isolatedRunner(t)
  const module = resolve(directory, 'validator.mjs')
  const actual = pathToFileURL(resolve(root, 'packages/validator/dist/index.js')).href
  await writeFile(module, `import {validateCrate as validate} from ${JSON.stringify(actual)}\nexport async function validateCrate(...args) { const result = await validate(...args); return {...result, status: 'controlled mismatch'} }\n`)
  const child = spawnSync(process.execPath, ['--import', 'tsx', 'tests/parity/run.mjs', '--snapshot', '--case=' + name],
    {cwd: directory, encoding: 'utf8', timeout: 30000, env: {...process.env, BIJUX_VALIDATOR_MODULE: pathToFileURL(module).href}})
  assert.equal(child.status, 1, child.stderr)
  assert.match(child.stderr, /Reproduce: npm run test:parity -- --case=/)
  assert.match(child.stderr, /Details: artifacts\/reports\/installed-snapshot-parity.json/)
  const report = JSON.parse(await readFile(resolve(directory, 'artifacts/reports/installed-snapshot-parity.json'), 'utf8'))
  assert.equal(report.failures[0].name, name)
  assert.equal(report.failures[0].actual.status, 'controlled mismatch')
})

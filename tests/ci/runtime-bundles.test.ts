import assert from 'node:assert/strict'
import {chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm, symlink, writeFile} from 'node:fs/promises'
import {spawnSync, execFileSync} from 'node:child_process'
import {dirname, resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import test from 'node:test'
import type {TestContext} from 'node:test'
import {inspectArchive, packBundle, restoreBundle, verifyManifest} from '../../scripts/ci/runtime-bundles.mjs'

// Exercise local behavior independently of the runner's own workflow identity.
delete process.env.CI
delete process.env.GITHUB_RUN_ID
delete process.env.GITHUB_RUN_ATTEMPT

const project = resolve(fileURLToPath(new URL('../../', import.meta.url)))
const gitDirectory = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {cwd: project, encoding: 'utf8'}).trim()
const assets = ['node_modules', 'apps/web/node_modules', 'packages/core/dist', 'packages/validator/dist', 'packages/creator/dist', 'artifacts/packages',
  'artifacts/consumers', 'artifacts/tools/consumer-types']
type FixtureManifest = {source_sha: string; kind: string; roots: string[]; external_symlinks: {path: string; target: string}[]; [key: string]: unknown}

async function fixture(t: TestContext) {
  const parent = resolve(project, 'artifacts/work')
  await mkdir(parent, {recursive: true})
  const root = await mkdtemp(resolve(parent, 'runtime-bundles-'))
  t.after(() => rm(root, {recursive: true, force: true}))
  // Reading the checkout's Git metadata keeps fixture receipts tied to the tested
  // source without creating commits or modifying any repository index.
  await writeFile(resolve(root, '.git'), 'gitdir: ' + gitDirectory + '\n')
  const paths = ['package-lock.json', 'docs/compatibility/reference.json', 'tests/parity/requirements-oracle.txt',
    ...(await readdir(resolve(project, 'scripts/dependencies/patches'))).sort().map(name => 'scripts/dependencies/patches/' + name)]
  for (const path of paths) {
    await mkdir(dirname(resolve(root, path)), {recursive: true})
    await copyFile(resolve(project, path), resolve(root, path))
  }
  const lockPath = resolve(root, 'package-lock.json')
  const lock = JSON.parse(await readFile(lockPath, 'utf8'))
  lock.packages['apps/web/node_modules/private-dependency'] = {version: '1.0.0'}
  await writeFile(lockPath, JSON.stringify(lock))
  for (const directory of ['core', 'validator', 'creator']) {
    const packageRoot = resolve(root, 'packages', directory)
    await mkdir(resolve(packageRoot, 'src'), {recursive: true})
    await writeFile(resolve(packageRoot, 'package.json'), JSON.stringify({name: '@fixture/' + directory, version: '1.0.0', type: 'module',
      exports: {'.': {import: './dist/index.js', types: './dist/index.d.ts'}}, scripts: {test: 'node --test'},
      bijux: {declarations: 'tsconfig.json', typecheck: ['tsconfig.json'], standaloneEntries: []}}))
    await writeFile(resolve(packageRoot, 'tsconfig.json'), '{}')
    await writeFile(resolve(packageRoot, 'src/index.ts'), 'export {}')
  }
  await mkdir(resolve(root, 'apps/web'), {recursive: true})
  await writeFile(resolve(root, 'apps/web/package.json'), JSON.stringify({name: '@fixture/web', private: true}))
  return root
}

function archive(root: string, kind: string, manifest: unknown, members: {path: string; type: string; target?: string}[]) {
  const program = String.raw`
import io, json, sys, tarfile
item = json.load(sys.stdin)
with tarfile.open(sys.argv[1], 'w:gz') as tar:
    data = json.dumps(item['manifest']).encode()
    entry = tarfile.TarInfo('artifacts/ci/' + item['kind'] + '.manifest.json')
    entry.size = len(data)
    tar.addfile(entry, io.BytesIO(data))
    for value in item['members']:
        entry = tarfile.TarInfo(value['path'])
        entry.type = {'file': tarfile.REGTYPE, 'symlink': tarfile.SYMTYPE,
                      'hardlink': tarfile.LNKTYPE, 'device': tarfile.CHRTYPE}[value['type']]
        entry.linkname = value.get('target', '')
        tar.addfile(entry, io.BytesIO(b''))
`
  const result = spawnSync('python3', ['-c', program, resolve(root, `artifacts/ci/${kind}.tar.gz`)],
    {input: JSON.stringify({kind, manifest, members}), encoding: 'utf8', timeout: 10000})
  assert.equal(result.status, 0, result.stderr)
}

async function prepared(t: TestContext) {
  const root = await fixture(t)
  for (const path of assets) await mkdir(resolve(root, path), {recursive: true})
  await mkdir(resolve(root, 'node_modules/.bin'))
  await writeFile(resolve(root, 'node_modules/runner'), 'executable runtime fixture\n')
  await writeFile(resolve(root, 'apps/web/node_modules/private-dependency'), 'app dependency')
  await chmod(resolve(root, 'node_modules/runner'), 0o755)
  await symlink('../runner', resolve(root, 'node_modules/.bin/runner'))
  await symlink('../packages/core', resolve(root, 'node_modules/core'))
  await symlink('../packages/creator', resolve(root, 'node_modules/creator'))
  await symlink('../apps/web', resolve(root, 'node_modules/web'))
  await writeFile(resolve(root, 'packages/creator/dist/index.js'), 'export const creator = true\n')
  const receipt = await packBundle(root, 'assets')
  return {root, receipt, manifest: JSON.parse(await readFile(resolve(root, 'artifacts/ci/assets.manifest.json')) as unknown as string) as FixtureManifest}
}

test('same-source runtime bundles preserve executable files and links in a clean checkout', async t => {
  const producer = await prepared(t)
  const root = await fixture(t)
  await mkdir(resolve(root, 'artifacts/ci'), {recursive: true})
  await copyFile(resolve(producer.root, producer.receipt.path), resolve(root, producer.receipt.path))
  await assert.rejects(restoreBundle(root, 'assets', '0'.repeat(64)), /archive SHA-256 differs/)
  await assert.rejects(lstat(resolve(root, 'node_modules')), {code: 'ENOENT'})
  await restoreBundle(root + '/', 'assets', producer.receipt.sha256)
  assert.equal(await readlink(resolve(root, 'node_modules/.bin/runner')), '../runner')
  assert.equal(await readlink(resolve(root, 'node_modules/core')), '../packages/core')
  assert.equal(await readlink(resolve(root, 'node_modules/creator')), '../packages/creator')
  assert.equal(await readlink(resolve(root, 'node_modules/web')), '../apps/web')
  assert.equal(await readFile(resolve(root, 'apps/web/node_modules/private-dependency'), 'utf8'), 'app dependency')
  assert.equal(await readFile(resolve(root, 'node_modules/creator/dist/index.js'), 'utf8'), 'export const creator = true\n')
  assert.equal((await lstat(resolve(root, 'node_modules/runner'))).mode & 0o777, 0o755)
  await verifyManifest(root, 'assets', producer.manifest)
  await assert.rejects(verifyManifest(root, 'assets', {...producer.manifest, source_sha: '0'.repeat(40)}), /source_sha/)
  await assert.rejects(restoreBundle(root, 'assets', producer.receipt.sha256), /Refusing to replace a prepared runtime/)
})

test('a source mismatch prevents every runtime write even with the correct archive checksum', async t => {
  const producer = await prepared(t)
  const root = await fixture(t)
  await mkdir(resolve(root, 'artifacts/ci'), {recursive: true})
  archive(root, 'assets', {...producer.manifest, source_sha: '0'.repeat(40)},
    [{path: 'node_modules/must-not-write', type: 'file'}])
  const expected = createHash('sha256').update(await readFile(resolve(root, 'artifacts/ci/assets.tar.gz'))).digest('hex')
  await assert.rejects(restoreBundle(root, 'assets', expected), /pin differs before extraction: source_sha/)
  await assert.rejects(lstat(resolve(root, 'node_modules')), {code: 'ENOENT'})
})

test('runtime archives reject traversal, unowned paths and link-based writes before extraction', async t => {
  const {root, manifest} = await prepared(t)
  const cases = [
    [{path: '/outside', type: 'file'}],
    [{path: 'node_modules/../outside', type: 'file'}],
    [{path: 'node_modules/a\\b', type: 'file'}],
    [{path: 'packages/core/src/outside', type: 'file'}],
    [{path: 'packages/creator/src/outside', type: 'file'}],
    [{path: 'node_modules/unknown', type: 'symlink', target: '../packages/unregistered'}],
    [{path: 'node_modules/unknown', type: 'symlink', target: '../apps/unregistered'}],
    [{path: 'node_modules/unknown', type: 'symlink', target: '../apps/web/src'}],
    [{path: 'packages/creator/dist/link', type: 'symlink', target: '../../../outside'}],
    [{path: 'packages/creator/dist/link', type: 'hardlink', target: 'packages/creator/src/index.ts'}],
    [{path: 'packages/creator/dist/duplicate', type: 'file'}, {path: 'packages/creator/dist/duplicate', type: 'file'}],
    [{path: 'node_modules/link', type: 'symlink', target: '../../outside'}],
    [{path: 'node_modules/link', type: 'symlink', target: '../packages/core'},
      {path: 'node_modules/link/child', type: 'file'}],
    [{path: 'node_modules/link', type: 'hardlink', target: '../outside'}],
    [{path: 'node_modules/device', type: 'device'}],
    [{path: 'node_modules/duplicate', type: 'file'}, {path: 'node_modules/./duplicate', type: 'file'}],
    [{path: 'node_modules/link', type: 'hardlink', target: 'node_modules/missing'}],
    [{path: 'node_modules/link', type: 'symlink', target: '../packages/core/src'}],
  ]
  for (const members of cases) {
    archive(root, 'assets', manifest, members)
    await assert.rejects(inspectArchive(root, 'assets'),
      /Unsafe archive path|Unexpected archive path|escapes prepared ownership|traverses a symlink|Hard link|Unexpected archive entry|Duplicate archive paths/)
  }
})

test('asset inspection rejects an invalid workspace inventory before extraction', async t => {
  const producer = await prepared(t)
  const root = await fixture(t)
  await mkdir(resolve(root, 'artifacts/ci'), {recursive: true})
  await copyFile(resolve(producer.root, producer.receipt.path), resolve(root, producer.receipt.path))
  const manifestPath = resolve(root, 'packages/creator/package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.name = '@fixture/core'
  await writeFile(manifestPath, JSON.stringify(manifest))
  await assert.rejects(restoreBundle(root, 'assets', producer.receipt.sha256), /Duplicate workspace package name/)
  await assert.rejects(lstat(resolve(root, 'node_modules')), {code: 'ENOENT'})
})

test('archive inspection has an explicit Python entry and rejects unknown modes', async t => {
  const {root, manifest} = await prepared(t)
  const policy = {roots: manifest.roots, workspaces: [...manifest.roots.filter(path => path.startsWith('packages/')).map(path => path.slice(0, -'/dist'.length)), 'apps/web']}
  const script = resolve(project, 'scripts/ci/inspect-runtime-archive.py')
  const args = [script, resolve(root, 'artifacts/ci/assets.tar.gz'), root, 'assets',
    'inspect', 'artifacts/ci/assets.manifest.json']
  const inspect = spawnSync('python3', args, {cwd: root, encoding: 'utf8', input: JSON.stringify(policy)})
  assert.equal(inspect.status, 0, inspect.stderr)
  assert.deepEqual(JSON.parse(inspect.stdout).roots, manifest.roots)
  const missingCreator = {...policy, workspaces: policy.workspaces.filter(path => path !== 'packages/creator')}
  const denied = spawnSync('python3', args, {cwd: root, encoding: 'utf8', input: JSON.stringify(missingCreator)})
  assert.notEqual(denied.status, 0)
  assert.match(denied.stderr, /Symlink escapes prepared ownership/)
  args[4] = 'unsupported'
  const invalid = spawnSync('python3', args, {cwd: root, encoding: 'utf8', input: JSON.stringify(policy)})
  assert.notEqual(invalid.status, 0)
  assert.match(invalid.stderr, /inspection mode/)
  args[3] = 'unsupported'
  args[4] = 'inspect'
  const invalidKind = spawnSync('python3', args, {cwd: root, encoding: 'utf8', input: JSON.stringify(policy)})
  assert.notEqual(invalidKind.status, 0)
  assert.match(invalidKind.stderr, /bundle kind/)
})

test('hostile duplicate entries cannot write even with their matching archive digest', async t => {
  const producer = await prepared(t)
  const root = await fixture(t)
  await mkdir(resolve(root, 'artifacts/ci'), {recursive: true})
  archive(root, 'assets', producer.manifest,
    [{path: 'node_modules/must-not-write', type: 'file'}, {path: 'node_modules/./must-not-write', type: 'file'}])
  const digest = createHash('sha256').update(await readFile(resolve(root, 'artifacts/ci/assets.tar.gz'))).digest('hex')
  await assert.rejects(restoreBundle(root, 'assets', digest), /Duplicate archive paths/)
  await assert.rejects(lstat(resolve(root, 'node_modules')), {code: 'ENOENT'})
})

test('truncated archives are rejected before writing a runtime', async t => {
  const producer = await prepared(t)
  const root = await fixture(t)
  await mkdir(resolve(root, 'artifacts/ci'), {recursive: true})
  const path = resolve(root, producer.receipt.path)
  const bytes = await readFile(resolve(producer.root, producer.receipt.path))
  const truncated = bytes.subarray(0, Math.floor(bytes.length / 2))
  await writeFile(path, truncated)
  const digest = createHash('sha256').update(truncated).digest('hex')
  await assert.rejects(restoreBundle(root, 'assets', digest))
  await assert.rejects(lstat(resolve(root, 'node_modules')), {code: 'ENOENT'})
})

test('reference archives permit only receipted Python interpreter links outside owned roots', async t => {
  const {root, manifest: assetsManifest} = await prepared(t)
  const target = '/opt/hostedtoolcache/Python/3.13.12/x64/bin/python3.13'
  for (const name of ['python', 'python3', 'python3.13']) {
    const path = 'artifacts/reference/python-env/bin/' + name
    const manifest = {...assetsManifest, kind: 'reference', roots: ['artifacts/reference/python', 'artifacts/reference/python-env'],
      external_symlinks: [{path, target}]}
    archive(root, 'reference', manifest, [{path, type: 'symlink', target}])
    assert.deepEqual((await inspectArchive(root, 'reference') as FixtureManifest).external_symlinks, [{path, target}])
  }
  const unreceipted = 'artifacts/reference/python-env/bin/python'
  const withoutReceipt = {...assetsManifest, kind: 'reference', roots: ['artifacts/reference/python', 'artifacts/reference/python-env'],
    external_symlinks: []}
  archive(root, 'reference', withoutReceipt, [{path: unreceipted, type: 'symlink', target}])
  await assert.rejects(inspectArchive(root, 'reference'), /Unexpected absolute symlink/)
  const path = 'artifacts/reference/python/src/unowned'
  const manifest = {...assetsManifest, kind: 'reference', roots: ['artifacts/reference/python', 'artifacts/reference/python-env'],
    external_symlinks: [{path, target}]}
  archive(root, 'reference', manifest, [{path, type: 'symlink', target}])
  await assert.rejects(inspectArchive(root, 'reference'), /Unexpected absolute symlink/)
})

test('a rerun restores the explicitly selected producer attempt', async t => {
  const previousRun = process.env.GITHUB_RUN_ID
  const previousAttempt = process.env.GITHUB_RUN_ATTEMPT
  t.after(() => {
    if (previousRun === undefined) delete process.env.GITHUB_RUN_ID
    else process.env.GITHUB_RUN_ID = previousRun
    if (previousAttempt === undefined) delete process.env.GITHUB_RUN_ATTEMPT
    else process.env.GITHUB_RUN_ATTEMPT = previousAttempt
  })
  process.env.GITHUB_RUN_ID = '12345'
  process.env.GITHUB_RUN_ATTEMPT = '1'
  const producer = await prepared(t)
  const root = await fixture(t)
  await mkdir(resolve(root, 'artifacts/ci'), {recursive: true})
  await copyFile(resolve(producer.root, producer.receipt.path), resolve(root, producer.receipt.path))
  process.env.GITHUB_RUN_ATTEMPT = '2'
  for (const attempt of [undefined, '', '0', '-1', '1.0', ' 1'])
    await assert.rejects(restoreBundle(root, 'assets', producer.receipt.sha256, attempt), /positive producer attempt/)
  await assert.rejects(restoreBundle(root, 'assets', producer.receipt.sha256, '2'), /run_attempt/)
  process.env.GITHUB_RUN_ID = '99999'
  await assert.rejects(restoreBundle(root, 'assets', producer.receipt.sha256, '1'), /run_id/)
  process.env.GITHUB_RUN_ID = '12345'
  await assert.rejects(lstat(resolve(root, 'node_modules')), {code: 'ENOENT'})
  await restoreBundle(root, 'assets', producer.receipt.sha256, '1')
  await verifyManifest(root, 'assets', producer.manifest, '1')
  await assert.rejects(verifyManifest(root, 'assets', producer.manifest, '2'), /run_attempt/)
  await assert.rejects(verifyManifest(root, 'assets', producer.manifest), /positive producer attempt/)
})

test('workflow consumers select and validate each runtime producer identity', async () => {
  for (const name of ['validation', 'package-candidate']) {
    const workflow = await readFile(resolve(project, `.github/workflows/${name}.yml`), 'utf8')
    for (const producer of name === 'validation' ? ['assets', 'reference-runtime'] : ['assets']) {
      const kind = producer === 'assets' ? 'assets' : 'reference'
      const selection = `artifact-ids: \${{ needs.${producer}.outputs.artifact_id }}`
      const attempt = `"\${{ needs.${producer}.outputs.producer_attempt }}"`
      const downloads = workflow.split(selection).length - 1
      const restores = [...workflow.matchAll(new RegExp(`restore ${kind} [^\\n]+`, 'g'))].map(match => match[0])
      assert.ok(downloads > 0)
      assert.equal(downloads, restores.length)
      assert.ok(restores.every(command => command.includes(attempt)))
      assert.equal(workflow.split(`PRODUCER_ARTIFACT_ID: \${{ needs.${producer}.outputs.artifact_id }}`).length - 1, downloads)
    }
    assert.ok(workflow.includes('artifact_id: ${{ steps.upload.outputs.artifact-id }}'))
    assert.ok(workflow.includes('producer_attempt: ${{ steps.bundle.outputs.producer_attempt }}'))
  }
})

test('independent producer attempts bind assets and reference bundles and the verify CLI', async t => {
  const previousRun = process.env.GITHUB_RUN_ID
  const previousAttempt = process.env.GITHUB_RUN_ATTEMPT
  t.after(() => {
    if (previousRun === undefined) delete process.env.GITHUB_RUN_ID
    else process.env.GITHUB_RUN_ID = previousRun
    if (previousAttempt === undefined) delete process.env.GITHUB_RUN_ATTEMPT
    else process.env.GITHUB_RUN_ATTEMPT = previousAttempt
  })
  const root = await fixture(t)
  const source = resolve(root, 'artifacts/reference/python')
  await mkdir(source, {recursive: true})
  await mkdir(resolve(root, 'artifacts/reference/python-env'), {recursive: true})
  execFileSync('git', ['init', '-q', source])
  execFileSync('git', ['-C', source, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'reference'])
  const commit = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim()
  await writeFile(resolve(root, 'docs/compatibility/reference.json'), JSON.stringify({commit, inputs: {}}))
  for (const path of assets) await mkdir(resolve(root, path), {recursive: true})
  process.env.GITHUB_RUN_ID = '12345'
  process.env.GITHUB_RUN_ATTEMPT = '1'
  const assetReceipt = await packBundle(root, 'assets')
  process.env.GITHUB_RUN_ATTEMPT = '2'
  const referenceReceipt = await packBundle(root, 'reference')
  await mkdir(resolve(root, 'scripts/ci'), {recursive: true})
  for (const path of ['scripts/ci/runtime-bundles.mjs', 'scripts/ci/inspect-runtime-archive.py', 'scripts/workspaces.mjs'])
    await copyFile(resolve(project, path), resolve(root, path))
  process.env.GITHUB_RUN_ATTEMPT = '3'
  const cli = (args: string[]) => spawnSync(process.execPath, ['scripts/ci/runtime-bundles.mjs', ...args], {cwd: root, encoding: 'utf8'})
  assert.equal(cli(['verify', 'reference', '2']).status, 0)
  for (const args of [['verify', 'reference'], ['verify', 'reference', '1'], ['verify', 'reference', '2', 'extra']])
    assert.notEqual(cli(args).status, 0)
  for (const path of [...assets, 'artifacts/reference/python', 'artifacts/reference/python-env'])
    await rm(resolve(root, path), {recursive: true, force: true})
  await restoreBundle(root, 'assets', assetReceipt.sha256, '1')
  await assert.rejects(restoreBundle(root, 'reference', referenceReceipt.sha256, '1'), /run_attempt/)
  await restoreBundle(root, 'reference', referenceReceipt.sha256, '2')
})

import assert from 'node:assert/strict'
import {chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm, symlink, writeFile} from 'node:fs/promises'
import {spawnSync, execFileSync} from 'node:child_process'
import {dirname, resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import test from 'node:test'
import {inspectArchive, packBundle, restoreBundle, verifyManifest} from '../../scripts/ci/runtime-bundles.mjs'

const project = resolve(fileURLToPath(new URL('../../', import.meta.url)))
const gitDirectory = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {cwd: project, encoding: 'utf8'}).trim()
const assets = ['node_modules', 'packages/core/dist', 'packages/validator/dist', 'artifacts/packages',
  'artifacts/consumers', 'artifacts/tools/consumer-types']

async function fixture(t) {
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
  return root
}

function archive(root, kind, manifest, members) {
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

async function prepared(t) {
  const root = await fixture(t)
  for (const path of assets) await mkdir(resolve(root, path), {recursive: true})
  await mkdir(resolve(root, 'node_modules/.bin'))
  await writeFile(resolve(root, 'node_modules/runner'), 'executable runtime fixture\n')
  await chmod(resolve(root, 'node_modules/runner'), 0o755)
  await symlink('../runner', resolve(root, 'node_modules/.bin/runner'))
  await symlink('../packages/core', resolve(root, 'node_modules/core'))
  const receipt = await packBundle(root, 'assets')
  return {root, receipt, manifest: JSON.parse(await readFile(resolve(root, 'artifacts/ci/assets.manifest.json')))}
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
    [{path: 'node_modules/link', type: 'symlink', target: '../../outside'}],
    [{path: 'node_modules/link', type: 'symlink', target: '../packages/core'},
      {path: 'node_modules/link/child', type: 'file'}],
    [{path: 'node_modules/link', type: 'hardlink', target: '../outside'}],
    [{path: 'node_modules/device', type: 'device'}],
  ]
  for (const members of cases) {
    archive(root, 'assets', manifest, members)
    assert.throws(() => inspectArchive(root, 'assets'),
      /Unsafe archive path|Unexpected archive path|escapes prepared ownership|traverses a symlink|Hard link|Unexpected archive entry/)
  }
})

test('reference archives permit only receipted Python interpreter links outside owned roots', async t => {
  const {root, manifest: assetsManifest} = await prepared(t)
  const target = '/opt/hostedtoolcache/Python/3.13.12/x64/bin/python3.13'
  for (const name of ['python', 'python3', 'python3.13']) {
    const path = 'artifacts/reference/python-env/bin/' + name
    const manifest = {...assetsManifest, kind: 'reference', roots: ['artifacts/reference/python', 'artifacts/reference/python-env'],
      external_symlinks: [{path, target}]}
    archive(root, 'reference', manifest, [{path, type: 'symlink', target}])
    assert.deepEqual(inspectArchive(root, 'reference').external_symlinks, [{path, target}])
  }
  const unreceipted = 'artifacts/reference/python-env/bin/python'
  const withoutReceipt = {...assetsManifest, kind: 'reference', roots: ['artifacts/reference/python', 'artifacts/reference/python-env'],
    external_symlinks: []}
  archive(root, 'reference', withoutReceipt, [{path: unreceipted, type: 'symlink', target}])
  assert.throws(() => inspectArchive(root, 'reference'), /Unexpected absolute symlink/)
  const path = 'artifacts/reference/python/src/unowned'
  const manifest = {...assetsManifest, kind: 'reference', roots: ['artifacts/reference/python', 'artifacts/reference/python-env'],
    external_symlinks: [{path, target}]}
  archive(root, 'reference', manifest, [{path, type: 'symlink', target}])
  assert.throws(() => inspectArchive(root, 'reference'), /Unexpected absolute symlink/)
})

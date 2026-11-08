import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createReadStream, createWriteStream} from 'node:fs'
import {appendFile, lstat, mkdir, readFile, readdir, readlink, realpath, rm, writeFile} from 'node:fs/promises'
import {spawn, spawnSync} from 'node:child_process'
import {dirname, isAbsolute, relative, resolve, sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import {pipeline} from 'node:stream/promises'
import {createGzip} from 'node:zlib'

const workspace = resolve(fileURLToPath(new URL('../../', import.meta.url)))
const roots = {
  assets: ['node_modules', 'packages/core/dist', 'packages/validator/dist', 'artifacts/packages',
    'artifacts/consumers', 'artifacts/tools/consumer-types'],
  reference: ['artifacts/reference/python', 'artifacts/reference/python-env'],
}
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const portable = path => path.split(sep).join('/')
const inside = (path, parent) => path === parent || path.startsWith(parent + '/')

function run(command, args, cwd) {
  const result = spawnSync(command, args, {cwd, encoding: 'utf8', timeout: 300000, maxBuffer: 4 * 1024 * 1024})
  assert.equal(result.status, 0, result.stderr || result.error?.message || `${command} failed`)
  return result.stdout.trim()
}

async function sha256(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

async function pins(root) {
  const paths = ['package-lock.json', 'docs/compatibility/reference.json', 'tests/parity/requirements-oracle.txt',
    ...(await readdir(resolve(root, 'scripts/dependencies/patches'))).sort().map(name => 'scripts/dependencies/patches/' + name)]
  const hashes = {}
  for (const path of paths) hashes[path] = digest(await readFile(resolve(root, path)))
  const reference = JSON.parse(await readFile(resolve(root, 'docs/compatibility/reference.json')))
  return {source_sha: run('git', ['rev-parse', 'HEAD'], root), hashes, reference_commit: reference.commit,
    platform: process.platform, arch: process.arch, run_id: process.env.GITHUB_RUN_ID ?? null,
    run_attempt: process.env.GITHUB_RUN_ATTEMPT ?? null}
}

function locations(root, kind) {
  assert.ok(Object.hasOwn(roots, kind), 'Bundle kind must be assets or reference')
  return {archive: resolve(root, `artifacts/ci/${kind}.tar.gz`),
    manifest: resolve(root, `artifacts/ci/${kind}.manifest.json`),
    manifestPath: `artifacts/ci/${kind}.manifest.json`}
}

async function externalLinks(root, kind) {
  const links = []
  async function visit(path) {
    const target = resolve(root, path)
    const entry = await lstat(target)
    if (entry.isSymbolicLink()) {
      const link = await readlink(target)
      const destination = resolve(dirname(target), link)
      const local = portable(relative(root, destination))
      if (local === '..' || local.startsWith('../') || isAbsolute(local)) {
        assert.ok(kind === 'reference' && /^artifacts\/reference\/python-env\/bin\/python(?:3(?:\.13)?)?$/.test(path),
          'Unexpected external runtime symlink: ' + path)
        assert.ok(isAbsolute(link), 'External interpreter symlinks must be absolute')
        assert.ok((await lstat(await realpath(target))).isFile(), 'Interpreter symlink is unavailable')
        links.push({path, target: link})
      } else {
        assert.ok(roots[kind].some(parent => inside(local, parent)) ||
          (kind === 'assets' && ['packages/core', 'packages/validator'].includes(local)),
        'Runtime symlink leaves prepared ownership: ' + path)
      }
    } else if (entry.isDirectory()) {
      for (const name of (await readdir(target)).sort()) await visit(path + '/' + name)
    } else assert.ok(entry.isFile(), 'Runtime bundles accept only regular files and symlinks: ' + path)
  }
  for (const path of roots[kind]) {
    for (let parent = dirname(resolve(root, path)); parent !== root; parent = dirname(parent))
      assert.ok(!(await lstat(parent)).isSymbolicLink(), 'Prepared runtime parent must be owned: ' + parent)
    assert.ok((await lstat(resolve(root, path))).isDirectory(), 'Prepared runtime root must be an owned directory: ' + path)
    await visit(path)
  }
  return links
}

// Validate all headers before extraction, including symlink ancestors. The only
// external links permitted are the producer's recorded Python interpreter links.
const archiveProgram = String.raw`
import json, os, pathlib, re, sys, tarfile
archive, root, kind, mode, manifest_name = sys.argv[1:]
allowed = json.loads(sys.stdin.read())
def beneath(path, parent):
    return path == parent or path.startswith(parent + '/')
def owned(path):
    return path == manifest_name or any(beneath(path, p) for p in allowed)
def clean(path):
    if not path or path.startswith('/') or '\\' in path or any(p == '..' for p in path.split('/')):
        raise ValueError('Unsafe archive path: ' + path)
    value = str(pathlib.PurePosixPath(path))
    if not owned(value): raise ValueError('Unexpected archive path: ' + path)
    return value
with tarfile.open(archive, 'r:gz') as tar:
    members = tar.getmembers()
    names = [clean(m.name) for m in members]
    if len(names) != len(set(names)): raise ValueError('Duplicate archive paths')
    by_name = dict(zip(names, members))
    if manifest_name not in by_name or not by_name[manifest_name].isfile():
        raise ValueError('Missing regular bundle manifest')
    manifest = json.load(tar.extractfile(by_name[manifest_name]))
    if manifest.get('kind') != kind or manifest.get('roots') != allowed:
        raise ValueError('Unexpected bundle ownership manifest')
    external = {x['path']: x['target'] for x in manifest.get('external_symlinks', [])}
    if len(external) != len(manifest.get('external_symlinks', [])): raise ValueError('Duplicate interpreter links')
    links = set()
    for name, m in zip(names, members):
        if not (m.isfile() or m.isdir() or m.issym() or m.islnk()):
            raise ValueError('Unexpected archive entry type: ' + name)
        if m.issym():
            links.add(name)
            if os.path.isabs(m.linkname):
                if kind != 'reference' or not re.fullmatch(r'artifacts/reference/python-env/bin/python(?:3(?:\.13)?)?', name) or external.get(name) != m.linkname:
                    raise ValueError('Unexpected absolute symlink: ' + name)
            else:
                target = os.path.normpath(os.path.join(os.path.dirname(name), m.linkname)).replace(os.sep, '/')
                if not (any(beneath(target, p) for p in allowed) or
                        kind == 'assets' and target in ('packages/core', 'packages/validator')):
                    raise ValueError('Symlink escapes prepared ownership: ' + name)
        if m.islnk():
            target = clean(m.linkname)
            if target not in by_name or not by_name[target].isfile():
                raise ValueError('Hard link lacks an owned regular target: ' + name)
    for name in names:
        if any(parent.as_posix() in links for parent in pathlib.PurePosixPath(name).parents):
            raise ValueError('Archive path traverses a symlink: ' + name)
    if set(external) != {n for n in names if by_name[n].issym() and os.path.isabs(by_name[n].linkname)}:
        raise ValueError('Interpreter link receipts differ from archive')
    if mode == 'extract':
        # Destinations are checked by the caller before any archive entry writes.
        tar.extractall(root, filter=lambda member, _path: member.replace(
            uid=None, gid=None, uname=None, gname=None, mode=member.mode & 0o777))
print(json.dumps(manifest))
`

export function inspectArchive(root, kind, {extract = false} = {}) {
  root = resolve(root)
  const paths = locations(root, kind)
  const result = spawnSync('python3', ['-c', archiveProgram, paths.archive, root, kind,
    extract ? 'extract' : 'inspect', paths.manifestPath], {cwd: root, encoding: 'utf8',
    input: JSON.stringify(roots[kind]), timeout: 300000, maxBuffer: 4 * 1024 * 1024})
  assert.equal(result.status, 0, result.stderr || result.error?.message || 'Bundle header validation failed')
  return JSON.parse(result.stdout)
}

export async function verifyManifest(root, kind, manifest) {
  root = resolve(root)
  assert.equal(manifest.schema, 1, 'Unsupported runtime bundle schema')
  assert.equal(manifest.kind, kind, 'Runtime bundle kind differs')
  assert.deepEqual(manifest.roots, roots[kind], 'Runtime bundle ownership differs')
  assert.deepEqual(await externalLinks(root, kind), manifest.external_symlinks, 'Runtime symlink receipts differ')
  const actual = await pins(root)
  for (const key of ['source_sha', 'hashes', 'reference_commit', 'platform', 'arch', 'run_id', 'run_attempt'])
    assert.deepEqual(manifest[key], actual[key], 'Runtime bundle pin differs: ' + key)
  if (kind === 'reference') {
    assert.equal(manifest.workspace_root, root, 'Reference environment requires the producer checkout location')
    for (const link of manifest.external_symlinks) {
      assert.equal(await readlink(resolve(root, link.path)), link.target, 'Interpreter link changed')
      await realpath(resolve(root, link.path))
    }
    const source = resolve(root, 'artifacts/reference/python')
    assert.ok((await lstat(resolve(source, '.git'))).isDirectory(), 'Reference bundle requires its own Git metadata directory')
    assert.equal(run('git', ['rev-parse', 'HEAD'], source), actual.reference_commit, 'Restored reference source differs')
    const reference = JSON.parse(await readFile(resolve(root, 'docs/compatibility/reference.json')))
    for (const [path, expected] of Object.entries(reference.inputs))
      assert.equal(await sha256(resolve(source, path)), expected, 'Restored reference input differs: ' + path)
  }
  return manifest
}

export async function packBundle(root, kind) {
  root = resolve(root)
  const paths = locations(root, kind)
  await mkdir(dirname(paths.archive), {recursive: true})
  const manifest = {schema: 1, kind, ...await pins(root), roots: roots[kind],
    external_symlinks: await externalLinks(root, kind)}
  if (kind === 'reference') {
    manifest.workspace_root = root
    await verifyManifest(root, kind, manifest)
  }
  await writeFile(paths.manifest, JSON.stringify(manifest, null, 2) + '\n')
  const child = spawn('tar', ['-cf', '-', ...roots[kind], paths.manifestPath], {cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: {...process.env, COPYFILE_DISABLE: '1'}})
  let stderr = ''
  child.stderr.on('data', value => {stderr += value.toString()})
  const done = new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve() : reject(new Error(stderr || 'Runtime bundle packing failed')))
  })
  const timer = setTimeout(() => child.kill('SIGKILL'), 300000)
  try {
    await Promise.all([pipeline(child.stdout, createGzip({level: 1}), createWriteStream(paths.archive)), done])
    inspectArchive(root, kind)
  } catch (error) {
    child.kill('SIGKILL')
    await rm(paths.archive, {force: true})
    throw error
  } finally {clearTimeout(timer)}
  return {kind, sha256: await sha256(paths.archive), path: portable(relative(root, paths.archive)),
    manifest: paths.manifestPath}
}

export async function restoreBundle(root, kind, expected) {
  root = resolve(root)
  const paths = locations(root, kind)
  assert.match(expected ?? '', /^[a-f0-9]{64}$/, 'A producer SHA-256 is required')
  assert.equal(await sha256(paths.archive), expected, 'Runtime bundle archive SHA-256 differs')
  const manifest = inspectArchive(root, kind)
  const current = await pins(root)
  for (const key of ['source_sha', 'hashes', 'reference_commit', 'platform', 'arch', 'run_id', 'run_attempt'])
    assert.deepEqual(manifest[key], current[key], 'Runtime bundle pin differs before extraction: ' + key)
  for (const path of [...roots[kind], paths.manifestPath]) {
    if (path === paths.manifestPath) assert.ok(!(await lstat(resolve(root, path)).catch(error => {if (error.code !== 'ENOENT') throw error}))?.isSymbolicLink(), 'Bundle manifest destination is a symlink')
    else await assert.rejects(lstat(resolve(root, path)), {code: 'ENOENT'}, 'Refusing to replace a prepared runtime: ' + path)
    for (let parent = dirname(resolve(root, path)); parent !== root; parent = dirname(parent)) {
      try {assert.ok(!(await lstat(parent)).isSymbolicLink(), 'Runtime parent is a symlink: ' + parent)}
      catch (error) {if (error.code !== 'ENOENT') throw error}
    }
  }
  if (kind === 'reference') {
    assert.equal(manifest.workspace_root, root, 'Reference environment requires the producer checkout location')
    for (const link of manifest.external_symlinks) await realpath(link.target)
  }
  inspectArchive(root, kind, {extract: true})
  return verifyManifest(root, kind, manifest)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, kind, expected, ...extra] = process.argv.slice(2)
  assert.ok(['pack', 'verify', 'restore'].includes(command) && !extra.length, 'Use pack|verify|restore assets|reference [producer-sha256]')
  assert.ok(command === 'restore' || expected === undefined, 'Only restore accepts a producer SHA-256')
  let result
  if (command === 'pack') {
    result = await packBundle(workspace, kind)
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT,
      `sha256=${result.sha256}\npath=${result.path}\nmanifest=${result.manifest}\n`)
  } else if (command === 'restore') result = await restoreBundle(workspace, kind, expected)
  else result = await verifyManifest(workspace, kind, JSON.parse(await readFile(locations(workspace, kind).manifest)))
  console.log(JSON.stringify(result, null, 2))
}

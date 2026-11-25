import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createReadStream, createWriteStream} from 'node:fs'
import {appendFile, lstat, mkdir, readFile, readdir, readlink, realpath, rm, writeFile} from 'node:fs/promises'
import {spawn, spawnSync} from 'node:child_process'
import {dirname, isAbsolute, relative, resolve, sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import {pipeline} from 'node:stream/promises'
import {createGzip} from 'node:zlib'
import type {BinaryLike} from 'node:crypto'
import {packagesInOrder} from '../workspaces.mjs'

const workspace = resolve(fileURLToPath(new URL('../../', import.meta.url)))
async function ownership(root: string, kind: string) {
  assert.ok(kind === 'assets' || kind === 'reference', 'Bundle kind must be assets or reference')
  if (kind === 'reference') return {roots: ['artifacts/reference/python', 'artifacts/reference/python-env'], workspaces: [] as string[]}
  const inventory = await packagesInOrder(root)
  const appRoot = resolve(root, 'apps')
  const appEntries = await readdir(appRoot, {withFileTypes: true}).catch((error: NodeJS.ErrnoException) => {if (error.code === 'ENOENT') return []; throw error})
  const apps: string[] = []
  const appDependencies: string[] = []
  const lock = JSON.parse(await readFile(resolve(root, 'package-lock.json'), 'utf8')) as {packages: Record<string, unknown>}
  for (const entry of appEntries) {
    assert.ok(entry.isDirectory(), 'App workspace must be an owned directory: ' + entry.name)
    const directory = resolve(appRoot, entry.name)
    assert.equal(await realpath(directory), directory, 'App workspace must not traverse a symlink')
    const manifest = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8')) as {private?: boolean}
    assert.equal(manifest.private, true, 'App workspace must be private: ' + entry.name)
    apps.push(`apps/${entry.name}`)
    const dependencies = `apps/${entry.name}/node_modules`
    if (Object.keys(lock.packages).some(path => path.startsWith(dependencies + '/'))) appDependencies.push(dependencies)
  }
  return {roots: ['node_modules', ...appDependencies, ...inventory.filter(item => !item.manifest.private).map(item => `packages/${item.directory}/dist`),
    'artifacts/packages', 'artifacts/consumers', 'artifacts/tools/consumer-types'],
  workspaces: [...inventory.map(item => `packages/${item.directory}`), ...apps]}
}
const digest = (bytes: BinaryLike) => createHash('sha256').update(bytes).digest('hex')
const portable = (path: string) => path.split(sep).join('/')
const inside = (path: string, parent: string) => path === parent || path.startsWith(parent + '/')

function run(command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, {cwd, encoding: 'utf8', timeout: 300000, maxBuffer: 4 * 1024 * 1024})
  assert.equal(result.status, 0, result.stderr || result.error?.message || `${command} failed`)
  return result.stdout.trim()
}

async function sha256(path: string) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

// JSON.parse coerces these file buffers to text; retain the original read boundary.
async function pins(root: string) {
  const paths = ['package-lock.json', 'docs/compatibility/reference.json', 'tests/parity/requirements-oracle.txt',
    ...(await readdir(resolve(root, 'scripts/dependencies/patches'))).sort().map(name => 'scripts/dependencies/patches/' + name)]
  const hashes: Record<string, string> = {}
  for (const path of paths) hashes[path] = digest(await readFile(resolve(root, path)))
  const reference: {commit: string} = JSON.parse(await readFile(resolve(root, 'docs/compatibility/reference.json')) as unknown as string)
  return {source_sha: run('git', ['rev-parse', 'HEAD'], root), hashes, reference_commit: reference.commit,
    platform: process.platform, arch: process.arch, run_id: process.env.GITHUB_RUN_ID ?? null,
    run_attempt: process.env.GITHUB_RUN_ATTEMPT ?? null}
}

function expectedAttempt(producerAttempt?: string | null): string | null {
  if (process.env.CI === 'true' || process.env.GITHUB_RUN_ID !== undefined || producerAttempt != null)
    assert.match(producerAttempt ?? '', /^[1-9][0-9]*$/, 'A positive producer attempt is required')
  return producerAttempt ?? null
}

type Manifest = Awaited<ReturnType<typeof pins>> & {schema: number; kind: string; roots: string[]; external_symlinks: {path: string; target: string}[]; workspace_root?: string}

function locations(root: string, kind: string) {
  assert.ok(kind === 'assets' || kind === 'reference', 'Bundle kind must be assets or reference')
  return {archive: resolve(root, `artifacts/ci/${kind}.tar.gz`),
    manifest: resolve(root, `artifacts/ci/${kind}.manifest.json`),
    manifestPath: `artifacts/ci/${kind}.manifest.json`}
}

async function externalLinks(root: string, kind: string, policy: Awaited<ReturnType<typeof ownership>>) {
  const links: {path: string; target: string}[] = []
  async function visit(path: string): Promise<void> {
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
        assert.ok(policy.roots.some(parent => inside(local, parent)) ||
          (kind === 'assets' && policy.workspaces.includes(local)),
        'Runtime symlink leaves prepared ownership: ' + path)
      }
    } else if (entry.isDirectory()) {
      for (const name of (await readdir(target)).sort()) await visit(path + '/' + name)
    } else assert.ok(entry.isFile(), 'Runtime bundles accept only regular files and symlinks: ' + path)
  }
  for (const path of policy.roots) {
    for (let parent = dirname(resolve(root, path)); parent !== root; parent = dirname(parent))
      assert.ok(!(await lstat(parent)).isSymbolicLink(), 'Prepared runtime parent must be owned: ' + parent)
    assert.ok((await lstat(resolve(root, path))).isDirectory(), 'Prepared runtime root must be an owned directory: ' + path)
    await visit(path)
  }
  return links
}

export async function inspectArchive(root: string, kind: string, {extract = false}: {extract?: boolean} = {}): Promise<unknown> {
  root = resolve(root)
  const paths = locations(root, kind)
  const inspector = fileURLToPath(new URL('./inspect-runtime-archive.py', import.meta.url))
  const result = spawnSync('python3', [inspector, paths.archive, root, kind,
    extract ? 'extract' : 'inspect', paths.manifestPath], {cwd: root, encoding: 'utf8',
    input: JSON.stringify(await ownership(root, kind)), timeout: 300000, maxBuffer: 4 * 1024 * 1024})
  assert.equal(result.status, 0, result.stderr || result.error?.message || 'Bundle header validation failed')
  return JSON.parse(result.stdout)
}

export async function verifyManifest<T>(root: string, kind: string, manifest: T, producerAttempt?: string | null): Promise<T> {
  root = resolve(root)
  const data = manifest as Manifest
  assert.equal(data.schema, 1, 'Unsupported runtime bundle schema')
  assert.equal(data.kind, kind, 'Runtime bundle kind differs')
  const policy = await ownership(root, kind)
  assert.deepEqual(data.roots, policy.roots, 'Runtime bundle ownership differs')
  assert.deepEqual(await externalLinks(root, kind, policy), data.external_symlinks, 'Runtime symlink receipts differ')
  const actual = {...await pins(root), run_attempt: expectedAttempt(producerAttempt)}
  for (const key of ['source_sha', 'hashes', 'reference_commit', 'platform', 'arch', 'run_id', 'run_attempt'] as const)
    assert.deepEqual(data[key], actual[key], 'Runtime bundle pin differs: ' + key)
  if (kind === 'reference') {
    assert.equal(data.workspace_root, root, 'Reference environment requires the producer checkout location')
    for (const link of data.external_symlinks) {
      assert.equal(await readlink(resolve(root, link.path)), link.target, 'Interpreter link changed')
      await realpath(resolve(root, link.path))
    }
    const source = resolve(root, 'artifacts/reference/python')
    assert.ok((await lstat(resolve(source, '.git'))).isDirectory(), 'Reference bundle requires its own Git metadata directory')
    assert.equal(run('git', ['rev-parse', 'HEAD'], source), actual.reference_commit, 'Restored reference source differs')
    const reference: {inputs: Record<string, string>} = JSON.parse(await readFile(resolve(root, 'docs/compatibility/reference.json')) as unknown as string)
    for (const [path, expected] of Object.entries(reference.inputs))
      assert.equal(await sha256(resolve(source, path)), expected, 'Restored reference input differs: ' + path)
  }
  return manifest
}

export async function packBundle(root: string, kind: string) {
  root = resolve(root)
  const paths = locations(root, kind)
  await mkdir(dirname(paths.archive), {recursive: true})
  const policy = await ownership(root, kind)
  const manifest: Manifest = {schema: 1, kind, ...await pins(root), roots: policy.roots,
    external_symlinks: await externalLinks(root, kind, policy)}
  expectedAttempt(manifest.run_attempt)
  if (kind === 'reference') {
    manifest.workspace_root = root
    await verifyManifest(root, kind, manifest, manifest.run_attempt)
  }
  await writeFile(paths.manifest, JSON.stringify(manifest, null, 2) + '\n')
  const child = spawn('tar', ['-cf', '-', ...policy.roots, paths.manifestPath], {cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: {...process.env, COPYFILE_DISABLE: '1'}})
  let stderr = ''
  child.stderr.on('data', value => {stderr += value.toString()})
  const done = new Promise<void>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve() : reject(new Error(stderr || 'Runtime bundle packing failed')))
  })
  const timer = setTimeout(() => child.kill('SIGKILL'), 300000)
  try {
    await Promise.all([pipeline(child.stdout, createGzip({level: 1}), createWriteStream(paths.archive)), done])
    await inspectArchive(root, kind)
  } catch (error) {
    child.kill('SIGKILL')
    await rm(paths.archive, {force: true})
    throw error
  } finally {clearTimeout(timer)}
  return {kind, sha256: await sha256(paths.archive), path: portable(relative(root, paths.archive)),
    manifest: paths.manifestPath}
}

export async function restoreBundle(root: string, kind: string, expected?: string, producerAttempt?: string | null) {
  root = resolve(root)
  const paths = locations(root, kind)
  const attempt = expectedAttempt(producerAttempt)
  assert.match(expected ?? '', /^[a-f0-9]{64}$/, 'A producer SHA-256 is required')
  assert.equal(await sha256(paths.archive), expected, 'Runtime bundle archive SHA-256 differs')
  const policy = await ownership(root, kind)
  const manifest = await inspectArchive(root, kind) as Manifest
  const current = {...await pins(root), run_attempt: attempt}
  for (const key of ['source_sha', 'hashes', 'reference_commit', 'platform', 'arch', 'run_id', 'run_attempt'] as const)
    assert.deepEqual(manifest[key], current[key], 'Runtime bundle pin differs before extraction: ' + key)
  for (const path of [...policy.roots, paths.manifestPath]) {
    if (path === paths.manifestPath) assert.ok(!(await lstat(resolve(root, path)).catch(error => {if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error}))?.isSymbolicLink(), 'Bundle manifest destination is a symlink')
    else await assert.rejects(lstat(resolve(root, path)), {code: 'ENOENT'}, 'Refusing to replace a prepared runtime: ' + path)
    for (let parent = dirname(resolve(root, path)); parent !== root; parent = dirname(parent)) {
      try {assert.ok(!(await lstat(parent)).isSymbolicLink(), 'Runtime parent is a symlink: ' + parent)}
      catch (error) {if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error}
    }
  }
  if (kind === 'reference') {
    assert.equal(manifest.workspace_root, root, 'Reference environment requires the producer checkout location')
    for (const link of manifest.external_symlinks) await realpath(link.target)
  }
  await inspectArchive(root, kind, {extract: true})
  return verifyManifest(root, kind, manifest, attempt)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, kind, ...args] = process.argv.slice(2)
  assert.ok(['pack', 'verify', 'restore'].includes(command) && args.length <= (command === 'restore' ? 2 : command === 'verify' ? 1 : 0),
    'Use pack assets|reference; restore assets|reference <producer-sha256> [producer-attempt]; verify assets|reference [producer-attempt]')
  let result
  if (command === 'pack') {
    result = await packBundle(workspace, kind)
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT,
      `sha256=${result.sha256}\npath=${result.path}\nmanifest=${result.manifest}\nproducer_attempt=${process.env.GITHUB_RUN_ATTEMPT ?? ''}\n`)
  } else if (command === 'restore') result = await restoreBundle(workspace, kind, args[0], args[1])
  else result = await verifyManifest(workspace, kind, JSON.parse(await readFile(locations(workspace, kind).manifest) as unknown as string), args[0])
  console.log(JSON.stringify(result, null, 2))
}

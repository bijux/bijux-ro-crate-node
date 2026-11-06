import assert from 'node:assert/strict'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {resolve} from 'node:path'
import {packagesInOrder, root} from '../workspaces.mjs'

const destination = resolve(root, 'artifacts/packages')
await mkdir(destination, {recursive: true})
assert.equal(JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).private, true)
const records = []
for (const item of await packagesInOrder()) {
  if (item.manifest.private) continue
  for (const dependency of Object.values(item.manifest.dependencies ?? {}))
    assert.ok(!/^(?:workspace|file|link):/.test(dependency), 'Unpublishable dependency')
  const result = spawnSync('npm', ['pack', '--workspace', item.manifest.name,
    '--pack-destination', destination, '--ignore-scripts', '--json'], {cwd: root, encoding: 'utf8'})
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
  const [packed] = JSON.parse(result.stdout)
  const paths = packed.files.map(item => item.path)
  assert.ok(paths.includes('LICENSE') && paths.includes('NOTICE') && paths.includes('README.md'))
  for (const path of paths) {
    assert.ok(/^(?:dist\/|LICENSE(?:S\/.*)?$|NOTICE$|README\.md$|package\.json$)/.test(path),
      'Unexpected published path: ' + path)
  }
  for (const target of Object.values(item.manifest.exports)) {
    assert.ok(paths.includes(target.import.replace(/^\.\//, '')))
    assert.ok(paths.includes(target.types.replace(/^\.\//, '')))
  }
  const archive = resolve(destination, packed.filename)
  records.push({name: item.manifest.name, version: item.manifest.version, directory: item.directory,
    archive, sha256: createHash('sha256').update(await readFile(archive)).digest('hex'),
    integrity: packed.integrity, files: paths, dependencies: item.manifest.dependencies ?? {}})
}
await writeFile(resolve(destination, 'manifest.json'), JSON.stringify(records, null, 2) + '\n')
console.log(JSON.stringify(records.map(({name, archive, sha256}) => ({name, archive, sha256})), null, 2))

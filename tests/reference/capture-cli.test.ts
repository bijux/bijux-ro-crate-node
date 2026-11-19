import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import test from 'node:test'
import {fileURLToPath} from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const reference = resolve(root, 'tests/reference')

test('capture verifier CLIs retain accepted records and reject changed input hashes', async t => {
  const artifacts = resolve(root, 'artifacts/work')
  await mkdir(artifacts, {recursive: true})
  const directory = await mkdtemp(resolve(artifacts, 'capture-cli-'))
  t.after(() => rm(directory, {recursive: true, force: true}))
  for (const [family, mode] of [['jsonld-processing', 'original'], ['jsonld-processing', 'corrected'], ['jsonld-processing', 'counterparts'], ['url-authorities', 'python']] as const) {
    const snapshot = await readFile(resolve(reference, family, mode + '.json'), 'utf8')
    const portable = JSON.parse(snapshot) as {cases: Array<{inputs_sha256: Record<string, string>}>}
    const raw = JSON.parse(snapshot.replaceAll('reference:pyld/jsonld.py', '/environment/pyld/jsonld.py')) as typeof portable
    const capture = {...raw, imported_module: '/environment/validator.py', ...(family === 'jsonld-processing' ? {reference_paths: {pyld_module: '/environment/pyld/jsonld.py'}} : {})}
    const file = resolve(directory, family + '-' + mode + '.json')
    const script = resolve(reference, family, 'verify-capture.mjs')
    const args = family === 'jsonld-processing' ? [mode, file] : [file]
    await writeFile(file, JSON.stringify(capture))
    const accepted = spawnSync(process.execPath, [script, ...args], {encoding: 'utf8'})
    assert.equal(accepted.status, 0, `${family}/${mode}: ${accepted.stderr}`)
    capture.cases[0].inputs_sha256[Object.keys(capture.cases[0].inputs_sha256)[0]] = 'changed'
    await writeFile(file, JSON.stringify(capture))
    assert.notEqual(spawnSync(process.execPath, [script, ...args], {encoding: 'utf8'}).status, 0, `${family}/${mode} accepted a changed input hash`)
    assert.notEqual(spawnSync(process.execPath, [script], {encoding: 'utf8'}).status, 0, `${family} accepted missing arguments`)
  }
})

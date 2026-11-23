import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtemp, mkdir, rm, symlink, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {fingerprintSourceInputs} from '../../package/source-inputs.mjs'

const artifacts = resolve('artifacts/source-input-tests')

test('source input fingerprint binds names and bytes and rejects missing or linked entries', async () => {
  await mkdir(artifacts, {recursive: true})
  const root = await mkdtemp(resolve(artifacts, 'inventory-'))
  try {
    await mkdir(resolve(root, 'source'))
    await writeFile(resolve(root, 'source/entry'), 'first')
    const original = await fingerprintSourceInputs(root, ['source'])
    assert.match(original, /^[a-f0-9]{64}$/)
    await writeFile(resolve(root, 'outside'), 'irrelevant')
    assert.equal(await fingerprintSourceInputs(root, ['source']), original)
    await writeFile(resolve(root, 'source/entry'), 'second')
    assert.notEqual(await fingerprintSourceInputs(root, ['source']), original)
    await writeFile(resolve(root, 'source/entry'), 'first')
    await writeFile(resolve(root, 'source/added'), 'new')
    assert.notEqual(await fingerprintSourceInputs(root, ['source']), original)
    await rm(resolve(root, 'source/added'))
    await symlink('../outside', resolve(root, 'source/link'))
    await assert.rejects(fingerprintSourceInputs(root, ['source']), /symlink/i)
    await assert.rejects(fingerprintSourceInputs(root, ['missing']), /missing/i)
    await mkdir(resolve(root, 'empty'))
    await assert.rejects(fingerprintSourceInputs(root, ['empty']), /empty/i)
  } finally { await rm(root, {recursive: true, force: true}) }
})

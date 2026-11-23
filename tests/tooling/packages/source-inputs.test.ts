import assert from 'node:assert/strict'
import test from 'node:test'
import {cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {dirname, resolve} from 'node:path'
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
    await symlink('source', resolve(root, 'alias'))
    await assert.rejects(fingerprintSourceInputs(root, ['alias/entry']), /symlink/i)
    await assert.rejects(fingerprintSourceInputs(root, ['missing']), /missing/i)
    await mkdir(resolve(root, 'empty'))
    await assert.rejects(fingerprintSourceInputs(root, ['empty']), /empty/i)
  } finally { await rm(root, {recursive: true, force: true}) }
})

// The fixture is an independent checkout; changes here never touch the working tree.
test('declared source inventory tracks actual implementation and qualification inputs', async () => {
  await mkdir(artifacts, {recursive: true})
  const root = await mkdtemp(resolve(artifacts, 'checkout-'))
  try {
    const archive = resolve(root, 'checkout.tar')
    execFileSync('git', ['archive', '--format=tar', '-o', archive, 'HEAD'])
    execFileSync('tar', ['-xf', archive, '-C', root])
    await rm(archive)
    await cp(resolve('packages/core/dist'), resolve(root, 'packages/core/dist'), {recursive: true})
    const original = await fingerprintSourceInputs(root)
    for (const path of [
      'packages/validator/src/validation/validate-crate.ts',
      'packages/core/src/crate/files.ts',
      'packages/core/dist/index.js',
      'tests/support/selection.mjs',
      'tests/inputs/file-paths.mjs',
      'tests/parity/cases.mjs',
      'tests/reference/blank-node-diagnostics/inputs.json',
      'tests/package/source-contracts.mjs',
      'scripts/workspaces.mjs',
      'packages/core/package.json',
      'packages/validator/package.json',
      'package-lock.json',
      'tsconfig.json',
      'docs/compatibility/reference.json',
    ]) {
      const file = resolve(root, path)
      const bytes = await readFile(file)
      await writeFile(file, Buffer.concat([bytes, Buffer.from('changed')]))
      assert.notEqual(await fingerprintSourceInputs(root), original, `Changed ${path} must alter the fingerprint`)
      await writeFile(file, bytes)
    }
    const existing = resolve(root, 'packages/validator/src/validation/validate-crate.ts')
    const bytes = await readFile(existing)
    await rm(existing)
    assert.notEqual(await fingerprintSourceInputs(root), original, 'Deleting a covered file must alter the fingerprint')
    await writeFile(existing, bytes)
    const added = resolve(root, 'packages/validator/src/validation/new-rule.ts')
    await writeFile(added, 'new untracked input')
    assert.notEqual(await fingerprintSourceInputs(root), original, 'Adding a covered file must alter the fingerprint')
    await rm(added)
    const unrelated = resolve(root, 'docs/unrelated.md')
    await mkdir(dirname(unrelated), {recursive: true})
    await writeFile(unrelated, 'documentation outside the inventory')
    assert.equal(await fingerprintSourceInputs(root), original)
  } finally { await rm(root, {recursive: true, force: true}) }
})

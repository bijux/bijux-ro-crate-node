import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {portableCapture} from './portable.mjs'

const expected = JSON.parse(await readFile(new URL('original.json', import.meta.url)))
const installedPath = '/environment/site-packages/pyld/jsonld.py'
const raw = {...structuredClone(expected), reference_paths: {pyld_module: installedPath}}
for (const row of raw.cases) if (row.exception)
  row.exception = JSON.parse(JSON.stringify(row.exception), (_key, value) =>
    typeof value === 'string' ? value.replaceAll('reference:pyld/jsonld.py', installedPath) : value)

test('only the declared pinned module filename varies across installations', () => {
  assert.deepEqual(portableCapture(raw), expected)
  const changed = structuredClone(raw)
  changed.reference_paths.pyld_module = '/environment/other.py'
  assert.throws(() => portableCapture(changed))
})
for (const [name, mutate] of [
  ['capture commit', item => {item.commit = 'other'}],
  ['input hash', item => {item.cases[0].inputs_sha256['file_list.tsv'] = 'other'}],
  ['identity', item => {item.cases[0].name = 'other'}],
  ['status', item => {item.cases[0].status = 'valid'}],
  ['exception type', item => {item.cases.find(row => row.exception).exception.type = 'TypeError'}],
  ['exception message', item => {item.cases.find(row => row.exception).exception.message += ' changed'}],
  ['lost finding', item => {for (const rows of Object.values(item.cases[0].report.issues)) rows.length = 0}],
  ['duplicate record', item => {item.cases[1] = structuredClone(item.cases[0])}],
]) test('capture identity retains ' + name, () => {
  const changed = structuredClone(raw); mutate(changed)
  assert.notDeepEqual(portableCapture(changed), expected)
})

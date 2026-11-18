import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {canonicalLiteral} from '../../src/metadata/rdf/literals/canonical.js'

const capture: {reference: string; values: {kind: string; input: string; error?: unknown; canonical?: string}[]} = JSON.parse(await readFile(new URL('../../../../tests/parity/expected/markup-identities.json', import.meta.url), 'utf8'))
const reference: {commit: string} = JSON.parse(await readFile(new URL('../../../../docs/compatibility/reference.json', import.meta.url), 'utf8'))
assert.equal(capture.reference, reference.commit)
for (const item of capture.values) {
  test(item.kind + ' term identity: ' + JSON.stringify(item.input), () => {
    const term = {value: item.input, datatype: {value: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#' + item.kind}}
    if (item.error) assert.throws(() => canonicalLiteral(term))
    else assert.equal(canonicalLiteral(term), item.canonical)
  })
}

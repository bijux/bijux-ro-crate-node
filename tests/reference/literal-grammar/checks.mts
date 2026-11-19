import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import * as html from '../html-tree-building/checks.mjs'
import * as xml from '../xml-name-edition/checks.mjs'

export const cases = [...html.cases, ...xml.cases]
export const originalByName = new Map([...html.originalByName, ...xml.originalByName])
export const approvedDifferences = new Set([...html.approvedDifferences, ...xml.approvedDifferences])
export const rejected = new Set([...html.rejected, ...xml.rejected])
assert.equal(cases.length, 62)
assert.equal(originalByName.size, cases.length)
assert.equal(new Set(cases.map(item => item.name)).size, cases.length)
assert.equal(approvedDifferences.size, 18)
assert.equal(rejected.size, 31)
assert.equal(html.reference.reference, xml.reference.reference)
export const reference = {reference: html.reference.reference,
  suite_sha256: createHash('sha256').update(JSON.stringify(cases)).digest('hex')}
const families = new Map<string, typeof html | typeof xml>([...html.cases.map(item => [item.name, html] as const), ...xml.cases.map(item => [item.name, xml] as const)])

/** Only independently qualified grammar inputs use these explicit contracts. */
export function assertResult(item: Parameters<typeof html.assertResult>[0], result: Parameters<typeof html.assertResult>[1]) {
  const family = families.get(item.name)
  assert.ok(family, 'Unregistered literal grammar input: ' + item.name)
  family.assertResult(item, result)
}

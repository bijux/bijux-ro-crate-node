import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'

const correction = {...JSON.parse(readFileSync(new URL('./correction.json', import.meta.url))),
  capture_sha256: createHash('sha256').update(readFileSync(new URL('./capture.py', import.meta.url))).digest('hex')}


/** Approve only the diagnosed inverse-path text, including its exception copy. */
export function assertDiagnosticCorrection(original, corrected) {
  const {cases: before, ...beforeMetadata} = original
  const {cases: after, diagnostic_correction, ...afterMetadata} = corrected
  assert.deepEqual(diagnostic_correction, correction, 'The corrected oracle requires explicit, hash-bound provenance')
  assert.deepEqual(afterMetadata, beforeMetadata)
  assert.equal(after.length, before.length)
  for (const [index, old] of before.entries()) {
    const fixed = after[index]
    const {report: a, exception: oldException, ...aRest} = old
    const {report: b, exception: newException, ...bRest} = fixed
    assert.deepEqual(bRest, aRest, 'The correction changed outcomes or input receipts')
    assert.equal(b.highest_error_level, a.highest_error_level)
    assert.deepEqual(Object.keys(b.issues).sort(), Object.keys(a.issues).sort())
    const replacements = new Map()
    for (const level of Object.keys(a.issues)) {
      assert.equal(b.issues[level].length, a.issues[level].length)
      const remaining = [...b.issues[level]]
      for (const row of a.issues[level]) {
        if (row.message.startsWith('Less than 1 values on ') &&
            row.message.endsWith('->[ sh:inversePath <http://schema.org/hasPart> ]')) {
          const index = remaining.findIndex(value => value.location_description === row.location_description &&
            value.severity === row.severity && value.message.startsWith('Less than 1 values on ') &&
            value.message.endsWith('->[ sh:inversePath <http://schema.org/hasPart> ]'))
          assert.ok(index >= 0, 'An inverse-path finding was lost or reclassified')
          const [next] = remaining.splice(index, 1)
          const {message: _beforeMessage, ...beforeFields} = row
          const {message: _afterMessage, ...afterFields} = next
          assert.deepEqual(afterFields, beforeFields)
          if (replacements.has(row.message)) assert.equal(replacements.get(row.message), next.message)
          replacements.set(row.message, next.message)
          if (row.location_description) replacements.set(row.location_description + ': \n   ' + row.message,
            next.location_description + ': \n   ' + next.message)
        } else {
          const index = remaining.findIndex(value => JSON.stringify(value) === JSON.stringify(row))
          assert.ok(index >= 0, 'An unrelated finding changed')
          remaining.splice(index, 1)
        }
      }
    }
    const rewritten = JSON.parse(JSON.stringify(oldException), (_key, value) =>
      _key === 'message' && typeof value === 'string' && replacements.has(value) ? replacements.get(value) : value)
    assert.deepEqual(newException, rewritten, 'An exception changed beyond the identified diagnostic text')
  }
}

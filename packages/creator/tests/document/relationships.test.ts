import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync} from 'node:fs'
import {applyChange, createDraft, inspectDraft, inspectIncomingReferences, materializeDraft} from '../../src/index.js'

test('dataset rename preserves two specimen acquisition associations and shared preparation', () => {
  let draft = createDraft()
  const change = (command: any) => {
    const result = applyChange(draft, command)
    assert.equal(result.status, 'applied')
    if (result.status !== 'applied') throw Error('change rejected')
    draft = result.draft
    return result.entityId
  }
  change({type: 'add-study'})
  const sampleA = change({type: 'add-entity', kind: 'biosample'})
  const sampleB = change({type: 'add-entity', kind: 'biosample'})
  const specimenA = change({type: 'add-entity', kind: 'specimen'})
  const specimenB = change({type: 'add-entity', kind: 'specimen'})
  const prep = change({type: 'add-entity', kind: 'preparation-protocol'})
  const acquisitionA = change({type: 'add-entity', kind: 'acquisition-protocol'})
  const acquisitionB = change({type: 'add-entity', kind: 'acquisition-protocol'})
  const datasetA = change({type: 'add-entity', kind: 'dataset'})
  const datasetB = change({type: 'add-entity', kind: 'dataset'})
  for (const [sourceId, relationship, targetId] of [
    [specimenA, 'biologicalEntity', sampleA], [specimenB, 'biologicalEntity', sampleB],
    [specimenA, 'imagingPreparationProtocol', prep], [specimenB, 'imagingPreparationProtocol', prep],
    [datasetA, 'associatedSpecimen', specimenA], [datasetB, 'associatedSpecimen', specimenB],
    [datasetA, 'associatedImageAcquisitionProtocol', acquisitionA], [datasetB, 'associatedImageAcquisitionProtocol', acquisitionB],
  ]) change({type: 'add-reference', sourceId, relationship, targetId})
  change({type: 'set-field', entityId: datasetA, field: 'name', value: 'Renamed dataset'})
  const result = materializeDraft(draft)
  assert.equal(result.status, 'materialized')
  if (result.status !== 'materialized') return
  const metadata = JSON.parse(result.files.get('ro-crate-metadata.json') as string)
  const graph = new Map<string, any>(metadata['@graph'].map((entry: any) => [entry['@id'], entry]))
  assert.deepEqual(graph.get(specimenA).biologicalEntity, [{'@id': sampleA}])
  assert.deepEqual(graph.get(specimenB).imagingPreparationProtocol, [{'@id': prep}])
  assert.deepEqual(graph.get(specimenA).imagingPreparationProtocol, [{'@id': prep}])
  assert.deepEqual(graph.get(datasetA).associatedSpecimen, {'@id': specimenA})
  assert.deepEqual(graph.get(datasetB).associatedSpecimen, {'@id': specimenB})
  assert.deepEqual(graph.get(datasetA).associatedImageAcquisitionProtocol, [{'@id': acquisitionA}])
  assert.deepEqual(graph.get(datasetB).associatedImageAcquisitionProtocol, [{'@id': acquisitionB}])
  assert.equal(graph.get(datasetA).name, 'Renamed dataset')
  assert.deepEqual(metadata['@context'][1].associatedSpecimen, {'@id': 'bia:associatedSubject'})
  assert.deepEqual(metadata['@context'][1].imagingPreparationProtocol, {'@id': 'bia:imagingPreparationProtocol', '@container': '@set'})
  assert.deepEqual(metadata['@context'][1].associatedImageAcquisitionProtocol, {'@id': 'bia:associatedImageAcquisitionProtocol', '@container': '@set'})
  assert.deepEqual(graph.get('./').hasPart, [{'@id': datasetA}, {'@id': datasetB}])
  const expected = JSON.parse(readFileSync(new URL('./fixtures/pilot-relationships.json', import.meta.url), 'utf8'))
  assert.deepEqual(metadata['@graph'].slice(2), expected)
})

test('invalid references and referenced deletion are atomic and views are detached', () => {
  let draft = createDraft()
  const step = (command: any) => {const result = applyChange(draft, command); assert.equal(result.status, 'applied'); if (result.status !== 'applied') throw Error(); draft = result.draft; return result.entityId}
  step({type: 'add-study'})
  const specimen = step({type: 'add-entity', kind: 'specimen'})
  const prep = step({type: 'add-entity', kind: 'preparation-protocol'})
  step({type: 'add-reference', sourceId: specimen, relationship: 'imagingPreparationProtocol', targetId: prep})
  assert.deepEqual(inspectIncomingReferences(draft, prep), [{sourceId: specimen, relationship: 'imagingPreparationProtocol'}])
  const before = inspectDraft(draft)
  assert.equal(applyChange(draft, {type: 'add-reference', sourceId: specimen, relationship: 'imagingPreparationProtocol', targetId: specimen} as any).status, 'rejected')
  assert.equal(applyChange(draft, {type: 'add-reference', sourceId: '#missing', relationship: 'imagingPreparationProtocol', targetId: prep} as any).status, 'rejected')
  assert.equal(applyChange(draft, {type: 'add-reference', sourceId: specimen, relationship: 'imagingPreparationProtocol', targetId: '#missing'}).status, 'rejected')
  assert.equal(applyChange(draft, {type: 'add-reference', sourceId: specimen, relationship: 'imagingPreparationProtocol', targetId: prep}).status, 'rejected')
  const deletion = applyChange(draft, {type: 'delete-entity', entityId: prep} as any)
  assert.equal(deletion.status, 'rejected')
  if (deletion.status === 'rejected') assert.deepEqual((deletion as any).references, [{sourceId: specimen, relationship: 'imagingPreparationProtocol'}])
  assert.deepEqual(inspectDraft(draft), before)
  ;(before as any).entities[0].id = '#changed'
  ;(before as any).entities[0].references.imagingPreparationProtocol.push('#changed')
  assert.notEqual((inspectDraft(draft) as any).entities[0].id, '#changed')
  assert.deepEqual(inspectIncomingReferences(draft, '#changed'), [])
  step({type: 'remove-reference', sourceId: specimen, relationship: 'imagingPreparationProtocol', targetId: prep})
  step({type: 'delete-entity', entityId: prep})
})


test('minted identities are unique and never reused after deletion', () => {
  let draft = createDraft()
  const addStudy = applyChange(draft, {type: 'add-study'})
  if (addStudy.status !== 'applied') throw Error('study was not added')
  draft = addStudy.draft
  assert.equal(applyChange(draft, {type: 'add-entity', kind: 'biosample', id: './'} as any).status, 'rejected')
  const first = applyChange(draft, {type: 'add-entity', kind: 'biosample'})
  if (first.status !== 'applied') throw Error('entity was not added')
  const second = applyChange(first.draft, {type: 'add-entity', kind: 'biosample'})
  if (second.status !== 'applied') throw Error('entity was not added')
  assert.notEqual(first.entityId, second.entityId)
  const removed = applyChange(second.draft, {type: 'delete-entity', entityId: first.entityId})
  if (removed.status !== 'applied') throw Error('entity was not deleted')
  const third = applyChange(removed.draft, {type: 'add-entity', kind: 'biosample'})
  if (third.status !== 'applied') throw Error('entity was not added')
  assert.notEqual(third.entityId, first.entityId)
  assert.notEqual(third.entityId, second.entityId)
  assert.equal(applyChange(third.draft, {type: 'delete-entity', entityId: first.entityId}).status, 'rejected')
})

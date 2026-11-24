import assert from 'node:assert/strict'
import {applyChange, createDraft, inspectIncomingReferences, materializeDraft} from '@bijux/ro-crate-creator'
const added = applyChange(createDraft(), {type: 'add-study'})
assert.equal(added.status, 'applied')
if (added.status !== 'applied') throw Error('study missing')
const changed = applyChange(added.draft, {type: 'set-field', entityId: added.entityId, field: 'name', value: 'Installed study'})
if (changed.status !== 'applied') throw Error('edit failed')
const output = materializeDraft(changed.draft)
if (output.status !== 'materialized') throw Error('export failed')
assert.equal(JSON.parse(output.files.get('ro-crate-metadata.json') as string)['@graph'][1].name, 'Installed study')

const specimen = applyChange(changed.draft, {type: 'add-entity', kind: 'specimen'})
if (specimen.status !== 'applied') throw Error('specimen missing')
const preparation = applyChange(specimen.draft, {type: 'add-entity', kind: 'preparation-protocol'})
if (preparation.status !== 'applied') throw Error('preparation missing')
const linked = applyChange(preparation.draft, {type: 'add-reference', sourceId: specimen.entityId, relationship: 'imagingPreparationProtocol', targetId: preparation.entityId})
if (linked.status !== 'applied') throw Error('reference missing')
assert.deepEqual(inspectIncomingReferences(linked.draft, preparation.entityId), [{sourceId: specimen.entityId, relationship: 'imagingPreparationProtocol'}])

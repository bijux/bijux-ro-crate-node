import assert from 'node:assert/strict'
import {applyChange, createDraft, materializeDraft} from '@bijux/ro-crate-creator'
const added = applyChange(createDraft(), {type: 'add-study'})
assert.equal(added.status, 'applied')
if (added.status !== 'applied') throw Error('study missing')
const changed = applyChange(added.draft, {type: 'set-field', entityId: added.entityId, field: 'name', value: 'Installed study'})
if (changed.status !== 'applied') throw Error('edit failed')
const output = materializeDraft(changed.draft)
if (output.status !== 'materialized') throw Error('export failed')
assert.equal(JSON.parse(output.files.get('ro-crate-metadata.json') as string)['@graph'][1].name, 'Installed study')

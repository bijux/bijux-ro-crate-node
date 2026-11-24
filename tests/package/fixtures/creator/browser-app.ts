import {applyChange, createDraft, materializeDraft} from '@bijux/ro-crate-creator'
const added = applyChange(createDraft(), {type: 'add-study'})
if (added.status !== 'applied') throw Error('study missing')
const edited = applyChange(added.draft, {type: 'set-field', entityId: added.entityId, field: 'name', value: 'Browser study'})
if (edited.status !== 'applied') throw Error('edit failed')
const result = materializeDraft(edited.draft)
if (result.status !== 'materialized') throw Error('export failed')
document.body.textContent = result.files.get('ro-crate-metadata.json') as string

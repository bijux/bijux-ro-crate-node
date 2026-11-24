# RO-Crate Creator

Create an in-memory study draft and materialize its RO-Crate metadata:

```ts
import {applyChange, createDraft, materializeDraft} from '@bijux/ro-crate-creator'

const added = applyChange(createDraft(), {type: 'add-study'})
if (added.status !== 'applied') throw new Error(added.issues[0].message)
const edited = applyChange(added.draft, {type: 'set-field', entityId: added.entityId, field: 'name', value: 'Microscopy study'})
if (edited.status !== 'applied') throw new Error(edited.issues[0].message)
const output = materializeDraft(edited.draft)
```

The initial slice supports one study at `./` and its `name`, `description`, and
`license` fields. The descriptor refers to that root, as in the repository's
`test_minimal_valid_ro_crate` fixture. Empty strings are retained; null clears a
field. Every accepted change creates a new revision, including a repeated value.
Documents are opaque and views and file maps are detached. A draft without a
study cannot be materialized; a materialized draft may still be incomplete or
invalid. No accession or publication date is invented.

This package does not import existing crates, persist drafts, edit manifests,
or implement submission-service mappings. The representation follows the local
fixture and has not been confirmed as accepted by the BIA Submission System.

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

The creator supports one study at `./` and its `name`, `description`, and
`license` fields. The descriptor refers to that root, as in the repository's
`test_minimal_valid_ro_crate` fixture. Empty strings are retained; null clears a
field. Every accepted change creates a new revision, including a repeated value.
Documents are opaque and views and file maps are detached. A draft without a
study cannot be materialized; a materialized draft may still be incomplete or
invalid. No accession or publication date is invented.

This package does not import existing crates, persist drafts,
or implement submission-service mappings. The representation follows the local
fixture and has not been confirmed as accepted by the BIA Submission System.

The creator also supports biosamples, specimens, specimen imaging preparation
protocols, image acquisition protocols and datasets. `add-entity` mints an ID;
`set-field` changes supported fields without changing that ID. `add-reference`
and `remove-reference` check source and target kinds and reject duplicate links.
A dataset can reference one specimen and multiple acquisition or preparation
protocols; a specimen can reference biosamples and preparation protocols.
`inspectIncomingReferences` identifies links that block `delete-entity`. Dataset
membership in the study is owned by the creator and removed with the dataset.
Views, including their reference arrays, are detached. Each accepted command
creates a revision; rejected commands leave the original unchanged.

The relationship representation follows the local validator model and parity
fixtures. The two-specimen example has not been scientifically reviewed or
accepted by BSS. It does not describe a complete submission.
Specimen display naming is deferred to the editor; the pinned specimen model
does not define a name field. Dataset names can be edited without changing IDs.

File rows can be added, updated, and deleted with `add-file`, `update-file`, and
`delete-file`. Each row names a dataset and specimen, has an exact non-negative
decimal size string without leading zeroes (except `0`), and is an image or annotation. An annotation may refer to
an existing image path; referenced images and metadata entities cannot be
deleted. Changes validate the complete inventory before creating a revision.
Paths must be canonical crate-relative names. They must begin and end with a Unicode letter, number, or underscore; other
characters are limited to letters, numbers, underscores, dots, spaces, hyphens,
and `/`. This conservative subset avoids ambiguous TSV inference and
spreadsheet formula prefixes. Numeric-only paths and standalone missing-value
or boolean spellings are also rejected. Generated metadata paths are reserved. The output
contains `file_list.tsv` and CSVW schema nodes, following the repository's
file-list fixtures. Manifest rows are metadata only: the creator does not
retain, check, or upload image payload bytes. BSS acceptance is unconfirmed.

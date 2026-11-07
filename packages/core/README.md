# @bijux/ro-crate-core

Reusable local RO-Crate inputs, resource loading and diagnostic primitives.
ES modules and TypeScript declarations; Node 22/24 and modern browsers.
No BIA models, UI, Python or Java dependencies.

## Inputs and immutable snapshots

```js
import {createWorkspace, snapshotFiles, fromDirectory} from '@bijux/ro-crate-core'

const files = new Map([['ro-crate-metadata.json', '{"@graph":[]}']])
const snapshot = snapshotFiles(files)
const workspace = createWorkspace(snapshot)
console.log(await workspace.readText('ro-crate-metadata.json'))

// A browser directory picker supplies File objects with webkitRelativePath.
// const selection = fromDirectory(input.files)
```

`CrateFiles` maps crate-relative names to strings, Blobs (including Files),
Uint8Arrays or ArrayBuffers. Byte buffers are copied at ownership boundaries;
strings and Blobs are immutable. Reading is lazy and UTF-8 decoding is strict.
Absolute paths, URI schemes, backslashes, NUL, traversal and duplicate normalized
selections are rejected. Names establish payload presence without reading pixels.

`decodeCrateReference(reference)` decodes UTF-8 percent escapes for selected
crate filenames. It preserves malformed escapes, encoded BOM characters and
replacement characters for malformed UTF-8, matching tolerant reference loading.
It does not normalize paths or grant filesystem access; workspace operations
still enforce crate-relative path confinement.
Workspace lookups resolve `.` and `..` through selected directories, while
refusing escape from the crate. A missing traversed directory does not become
an alias for an existing file. Selected entry names themselves remain strict;
an entry cannot be both a file and a directory.
`workspace.resolveFile(decodedReference)` returns the selected file's normalized
path, or `null` for a missing file, directory or invalid reference. It uses the
same confinement rules as reading and does not load the file contents.

## Trusted resources and reports

```js
import {createDocumentLoader, reportOf} from '@bijux/ro-crate-core'

const load = createDocumentLoader(new Map([
  ['https://example.org/context', {'@context': {name: 'http://schema.org/name'}}],
]))
const document = await load('https://example.org/context')
const report = reportOf([{message: 'Missing name', severity: 40, location_description: './'}])
```

The loader copies configured resources and each returned document. Unknown URLs
fail without network fallback. Report severity buckets are CRITICAL (50), ERROR
(40), WARNING (30), INFO (20) and DEBUG (10). Reports retain duplicate findings;
`highest_error_level` is null for an empty report. These primitives do not infer
whether crate validation completed; the validator owns that outcome contract.

Version 0.1.0. Apache-2.0; LICENSE, NOTICE and bundled dependency licenses ship
with the package. Source: [bijux-ro-crate-node](https://github.com/bijux/bijux-ro-crate-node).

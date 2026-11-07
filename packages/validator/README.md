# @bijux/ro-crate-validator

Local BIA RO-Crate validation for Node 22/24 and modern browser module workers.
Version 0.1.0 depends on `@bijux/ro-crate-core@0.1.0`. ESM imports and strict
TypeScript declarations are provided for `.`, `/browser` and `/worker`.

## Validate exact local bytes

```js
import {validateCrate} from '@bijux/ro-crate-validator'

const files = new Map([
  ['ro-crate-metadata.json', metadataText],
  ['file_list.tsv', manifestText],
])
const result = await validateCrate(files)
if (result.status === 'incomplete') console.error(result.stage, result.reason)
console.log(result.report.issues.ERROR)
```

Values may be UTF-8 strings, Files/Blobs, Uint8Arrays or ArrayBuffers. Use all
required crate-relative names, including the declared manifest paths. Unrelated
image bytes stay unread. Validation snapshots mutable input buffers before work
starts. Reports preserve every severity/message/location finding and duplicates.
`valid` means completed without ERROR/CRITICAL; `invalid` means completed with
errors; `incomplete` means execution could not establish an outcome. Never treat
an empty incomplete report as approval.

The bundled RO-Crate 1.1 context is available offline. Optional
`{contexts: new Map([[url, trustedDocument]])}` supplies additional local JSON-LD
resources. Resources are copied before work starts, have no network fallback,
and cannot replace the pinned standard context.

## Browser repair and continuation

```js
import {ValidationSession, fromDirectory} from '@bijux/ro-crate-validator/browser'

const session = new ValidationSession({debounceMs: 250, timeoutMs: 60000})
const unsubscribe = session.subscribe(state => {
  continueButton.disabled = !state.eligible
  renderFindingsSafely(state.result?.report) // use textContent or equivalent
})
session.select(fromDirectory(directoryInput.files))
metadataEditor.addEventListener('input', () => {
  session.edit('ro-crate-metadata.json', metadataEditor.value)
})
continueButton.addEventListener('click', () => {
  const validated = session.continue() // throws unless this exact revision is valid
  submitValidatedSnapshot(validated.files, validated.options)
})
// On teardown: unsubscribe(); session.dispose()
```

`select`, `edit` and `updateOptions` synchronously revoke eligibility and advance
identity. `cancel()` terminates active work and refuses continuation;
`revalidate()` schedules the current revision. `dispose()` releases the worker
and listeners. Replies are checked against session, revision and job identity;
obsolete or malformed replies cannot authorize submission. `continue()` returns
a detached file/options/result snapshot, never the mutable editor controls.

The default worker is a relative module URL beside the browser export. Serve
those package assets from HTTPS or a trusted loopback origin (the session uses
`crypto.randomUUID`, which requires a secure browser context), with the core import resolvable by a bundler
or browser import map. A bundler that relocates `browser.js` must copy the
self-contained `dist/worker.js` asset to its served output and supply its URL:

```js
const session = new ValidationSession({
  workerFactory: () => new Worker(new URL('./worker.js', import.meta.url), {type: 'module'}),
})
```

`/worker` is an explicit module-worker entrypoint, not an inline fallback.
Validation makes no network requests after application assets load. A worker
must be permitted by the application's content-security policy.

## Compatibility and limits

Behavioral target: Python
[`bia-ro-crate-validator` PR #23 at `9cd5b307c328ddc99994561e44e0fff272e83001`](https://github.com/BioImage-Archive/bia-ro-crate-validator/pull/23).
This reviewed provisional reference is awaiting upstream merge.
The independent corpus covers all 13 upstream fixture directories plus boundary,
mutation and realistic manifest cases. The 276 captured outcomes and full report
multisets match in snapshot replay on Node and the qualified browser engines.
Fresh qualification compares the same immutable bytes against that exact Python
commit; see [compatibility evidence](../../docs/compatibility/PARITY.md).
This finite evidence does not prove equivalence for arbitrary JSON-LD or
arbitrary ontologies.

The BIA profile includes generated required constraints and bounded property,
identity, class and schema inference from the pinned ontology.
Its cooperating rules share a graph/path budget; exhaustion produces `incomplete`
without truncating findings or approving unfinished work. The same complete
corpus runs through installed packages on both Node 22.23.4 and 24.3.0.
Large inputs are held in memory. The session's
60-second default execution deadline is configurable; direct `validateCrate`
does not supply a CPU deadline. Server validation remains the submission
service's responsibility.

See repository [compatibility evidence](https://github.com/bijux/bijux-ro-crate-node/blob/main/docs/compatibility/PARITY.md)
for exact tested versions, corpus identities and measured workloads. Python
transactional editing and additional RO-Crate profiles are outside this release.
Apache-2.0; LICENSE, NOTICE and LICENSES include upstream code/context and
bundled dependency attributions.

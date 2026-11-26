# Study authoring application

The private `apps/web` workspace provides a local study editor. Astro owns the
page and Node server; a Vue editor uses creator's public document operations.
The current editor creates a study, edits its title, description, license and
funding statement, and manages contributors, author order, shared affiliations,
publications, grants and funding bodies before downloading RO-Crate metadata.
Section links switch the working area while keeping the current draft in memory.
Biosample, specimen, protocol and dataset sections edit typed relationships;
shared records show their dependents and cannot be deleted while referenced.
Specimen labels are local draft aids and are not exported as metadata.
Publication year is not editable here; the creator preserves it on supported
imports. Local recovery stores separate browser copies and restores only after
explicit selection. A full backup retains the editable draft, pending file
listings and unfinished vocabulary input; metadata download remains separate. Neither contains image payloads
or validation approval. Unsupported imports remain read-only and can be saved
as a read-only backup. Browser storage is bounded and can fail; the editor
reports failures while retaining the current work in the open tab. Copy lists
read only indexed metadata; the selected backup is loaded with its revision
precondition when restored. Existing browser copies retain their bytes when
the metadata index is added.

Biosample organisms and acquisition imaging methods can be entered manually or
selected from search suggestions. Applying a suggestion writes its identifier
and label to the draft; it does not verify it. An explicit check sends the
identifier through the application server to the fixed EMBL-EBI Ontology Lookup
Service (OLS) endpoint for NCBITaxon or FBbi. The server bounds request time,
response size and cache entries. Search sends the entered label to the same
service. The interface distinguishes exact preferred-label agreement, a mismatch,
not found, obsolete, unavailable and descriptive text. Synonyms are displayed but
are not accepted as preferred labels by this interface. Evidence is transient and
is discarded when the draft or value changes; it is not a saved validation approval.
Unapplied vocabulary input is retained by recovery and editable backups. Apply or
discard it before validation or metadata export. Pending entries must still target
an editable field, and edits that would orphan them or exceed the recovery size
limit are rejected while retaining the existing work.
Agreement does not establish biological appropriateness or archive acceptance.
Multiple imported imaging names or identifiers remain visible and unchanged
because their independent arrays do not establish pairings. A Taxon may be shared;
editing its scientific name affects all references to that record.

The source API's [search and exact term documentation](https://www.ebi.ac.uk/ols4/ols3help)
describes the operations used here. The BioImage Archive's
[vocabulary guidance](https://www.ebi.ac.uk/bioimage-archive/file-list-ontology-guidance/)
identifies NCBITaxon and FBbi for organism and imaging-method terms.

The application requires Node.js 22.23.4 or a later supported even-numbered
release. This does not change the public packages' Node 22 compatibility floor.
From the repository root, run:

```sh
npm ci
npm run build
npm run dev --workspace @bijux/ro-crate-web
```

Use `npm run check --workspace @bijux/ro-crate-web` for Astro and Vue template
checks, `npm run test --workspace @bijux/ro-crate-web` for editor and boundary
checks, and `npm run build --workspace @bijux/ro-crate-web` followed by
`npm run test:e2e --workspace @bijux/ro-crate-web` for the built browser journey.
The browser test uses the repository's locked Playwright installation; set
`PLAYWRIGHT_BROWSERS_PATH` to the existing browser cache when needed. The
independent ZIP inspection uses Python 3's standard-library `zipfile` reader,
which is included in the pinned CI image. The application serves the pinned
Visual Framework stylesheet and fonts locally;
[asset provenance and licenses](../../apps/web/public/visual-framework/README.md)
are recorded with those files.

Source admission requires every authored TypeScript file to belong to a strict
compiler project registered in the root solution. Vue script blocks must use
TypeScript, and Astro script tags must have no attributes so Astro processes
and typechecks them. The check rejects directives that disable typechecking.

App output and generated framework files are under `artifacts/`. Package
publication and installed-consumer qualification continue to discover public
workspaces under `packages/`; the app is private.

The private application compiler project sets `skipLibCheck: true` for
third-party declaration defects. Authored TypeScript remains strict, and
`astro check` and `vue-tsc` still check Astro and Vue templates. The app test
project and all public package compiler projects continue to check library
declarations. This exception does not alter the public packages' type policy.

With the locked Astro 7.4.13 and unstorage 1.17.6, checking third-party
declarations reports missing `AstroAdapterClientConfig` and `ContextProvider`
in published Astro declarations, despite their definitions in the matching
Astro sources for [adapter configuration](https://github.com/withastro/astro/blob/astro%407.4.13/packages/astro/src/types/public/integrations.ts#L98-L114)
and [request context](https://github.com/withastro/astro/blob/astro%407.4.13/packages/astro/src/core/fetch/fetch-state.ts#L84-L96).
The same check reports unresolved `@astrojs/markdown-remark` declarations and
unstorage optional session-provider types, including Cloudflare `KVNamespace`
and `db0`. No replacement ambient declarations are supplied.

To reproduce the vendor diagnostics from the repository root, run:

```sh
npm run build
mkdir -p artifacts/logs
./node_modules/.bin/vue-tsc --noEmit -p apps/web/tsconfig.json --skipLibCheck false > artifacts/logs/astro-vendor-types.log 2>&1
```

Remove the app-only exception when a supported Astro and unstorage dependency
set resolves these declarations. Verify the command above exits successfully,
then rerun the app checks and `npm run check:types` without the exception.
Until then, the app compiler does not verify third-party declaration internals.


## Local reference qualification

The private server provides a local reference for running the public validator's
full default crate validation on frozen saved file bytes. Results retain the
saved version identity and a digest of the exact paths and bytes, and identify
the policy as `local-reference/default-validation`. Worker concurrency, waiting
queue, input size, execution time, and the worker V8 heap and stack are bounded; cancellation, worker failure,
incomplete validation and timeout cannot produce a valid result. The built app
includes the compiled worker under `server/qualification/`.

The local account history allows an owner to select a saved version and run
default validation. The authenticated server reads the original frozen bytes
from that owned version; the result is bound to the saved version, payload hash
and an independent frozen-file digest. Read-only imports can be validated when
they have no pending file listings. Blocked or pending versions remain incomplete. The saved payload content hash is separate
from the digest of the frozen file bytes. A valid default validator result does not
establish image payload presence, submission readiness, service availability or
archive acceptance. V8 resource limits do not impose an operating-system limit on all process or
external memory. The real pre-submission policy and BSS, DEV and production
integration remain undecided and unconfigured.

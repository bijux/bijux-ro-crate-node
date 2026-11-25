# bijux-ro-crate-node

RO-Crate libraries for JavaScript and TypeScript, with local BIA submission
validation, editable metadata drafts and live browser repair. Node 22 and 24
and modern Chromium, Firefox and WebKit are the qualified targets. Runtime validation needs neither Python
nor Java and makes no context/network requests.

| Package | Responsibility |
| --- | --- |
| `@bijux/ro-crate-core` | Crate-relative inputs, immutable snapshots, trusted local resources and diagnostic reports |
| `@bijux/ro-crate-validator` | BIA metadata, RO-Crate profile, TSV/reference validation and a browser worker session |
| `@bijux/ro-crate-creator` | Immutable study drafts, scientific relationships, file manifests and preservation-aware metadata import |

The private study editor can validate its current metadata and selected payload
names locally using the packaged browser worker. The review groups the current
report by severity and offers its complete result for download. Checks may stop
after errors; payload selection coverage is separate, and submission readiness
is not configured.

The private root is an npm workspace, not a published package. All three public
packages start at **0.1.0**; creator and validator depend on core **0.1.0**. Additional
RO-Crate domains can add independent packages without adding BIA rules to core.

The **0.1.0 packages are unpublished**. Package names remain subject to
verified `@bijux` ownership. Canonical shared governance is pinned to an accepted GitHub source. Registry
publication and registry-installed verification remain release prerequisites;
the installed publisher is disabled. See the
[release procedure](docs/development/release.md).

## Validate a crate

After publication, install `@bijux/ro-crate-validator@0.1.0`. Before publication,
build and install the two qualified tarballs from `artifacts/packages/` together.

```js
import {readFile} from 'node:fs/promises'
import {validateCrate} from '@bijux/ro-crate-validator'

const files = new Map([
  ['ro-crate-metadata.json', await readFile('crate/ro-crate-metadata.json')],
  ['file_list.tsv', await readFile('crate/file_list.tsv')],
])
const result = await validateCrate(files)
console.log(result.status, result.report)
```

Supply crate-relative names and the actual declared manifests. `File`, `Blob`,
UTF-8 strings, `Uint8Array` and `ArrayBuffer` values are supported. Selected image
payloads remain unread; their names may be used for payload-presence checks.
A result is `valid`, `invalid`, or `incomplete`. Only `valid` permits submission.
An empty report from an interrupted run is never evidence of validity.

The validator targets actual merged Python main at
[`c21eb70cb6f2d556e79ebc21706c0fcfd7b689b4`](https://github.com/BioImage-Archive/bia-ro-crate-validator/commit/c21eb70cb6f2d556e79ebc21706c0fcfd7b689b4).
Proved upstream-defect qualifications remain explicitly separate from raw Python reports.
[Compatibility evidence](docs/compatibility/PARITY.md) defines finite corpus
coverage and operating limits. Confirmed Python defects have explicit Node
corrections and a separate required [guard suite](docs/compatibility/UPSTREAM.md).
Generic RO-Crate validation for arbitrary
profiles and Python transactional editing APIs are outside this release.

## Author metadata

Use the [creator API](packages/creator/README.md) to create a study, connect
specimens and datasets, and materialize JSON-LD metadata and a TSV file list.
It can also import an explicitly selected, bounded set of metadata files.
Supported edits preserve unknown content; unsupported structures remain
read-only with recoverable bytes. Image payloads are not retained or uploaded.
Materializing a draft does not establish validity or submission readiness.

The private [study authoring application](docs/development/creator-and-submission-app.md)
provides a local create, edit and metadata-download journey, including contributors,
shared affiliations, publications and funding. After `npm ci`
and `npm run build`, start it with `npm run dev --workspace @bijux/ro-crate-web`.
Drafts live only in the open browser tab; the download does not include images.
List file or directory names and sizes, then assign selected rows to existing
datasets and specimens. File contents are neither read nor uploaded. A draft with
file listings downloads JSON-LD and its TSV manifest together in a ZIP archive;
unassigned listings must be assigned or removed first. The archive uses
[fflate](https://github.com/101arrowz/fflate), distributed under its
[MIT license](apps/web/public/fflate-LICENSE.txt).

## Live browser validation

Serve the browser integration over HTTPS or a trusted loopback origin.
Use the [validator browser API](packages/validator/README.md) to select files,
edit metadata or manifests and subscribe to findings. Every edit immediately
revokes continuation, before debounce. A dedicated worker validates an immutable
revision. Superseded workers terminate; stale replies cannot approve new bytes.
`continue()` rechecks the current identity and returns the exact validated
snapshot for the application's submission code.

The [submission example](examples/submission/index.html) supports local folder
selection, keyboard repair and safe findings. It emits a local `cratevalidated`
event; applications own any upload destination and submission handling.

## Develop and verify

```sh
npm ci
npm test
npm run test:parity -- --snapshot
npm run check:workspace
npm run check:types
make node-check
make bijux-std-checks
make bijux-standard-check
npm run example
```

Open the localhost URL printed by `example`. Build output lives in each
package's governed `dist/`. All three package implementations are strict
TypeScript; their declarations are generated from source during `npm run build`, and
`npm run check:types` checks the source and public consumers. The root
`tsconfig.json` connects editors to the separate TypeScript projects; use
`npm run check:types` rather than `tsc -p tsconfig.json` to check all projects.
Run products,
browser downloads, environments, logs, measurements and tarballs live under
root `artifacts/`.

For independent live parity, prepare the isolated exact Python reference with
`scripts/reference/prepare.sh` and run `npm run test:parity`. It needs CPython
3.13.12, uv 0.11.17 and the checked-in locked requirements. The complete upstream
ontology qualification also needs Java 17; these are development tools only.

```sh
npm exec -- playwright install chromium firefox webkit
npm run test:browser
npm run test:live
npm run test:workload
npm run test:pack
```

Set `PLAYWRIGHT_BROWSERS_PATH` to an absolute root `artifacts/tools/browsers`
path before installing/running browsers and `TMPDIR` to root `artifacts/work`
after creating it. Full CI commands, race/offline tests and evidence identities
are in [PARITY.md](docs/compatibility/PARITY.md). Start with the
[contributor guide](docs/development/contributing.md) for ownership, focused
checks and generated-file review. Package extension rules are in
[workspace architecture](docs/development/workspaces.md).

Apache-2.0; see [source provenance](docs/compatibility/source-provenance.md) and
package NOTICE/LICENSES for upstream code, contexts and bundled dependencies.

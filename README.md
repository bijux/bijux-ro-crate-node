# bijux-ro-crate-node

RO-Crate libraries for JavaScript and TypeScript, with local BIA submission
validation and live browser repair. Node 22 and 24 and modern Chromium, Firefox
and WebKit are the qualified targets. Runtime validation needs neither Python
nor Java and makes no context/network requests.

| Package | Responsibility |
| --- | --- |
| `@bijux/ro-crate-core` | Crate-relative inputs, immutable snapshots, trusted local resources and diagnostic reports |
| `@bijux/ro-crate-validator` | BIA metadata, RO-Crate profile, TSV/reference validation and a browser worker session |

The private root is an npm workspace, not a published package. Both public
packages start at **0.1.0**; validator depends on core **0.1.0**. Additional
RO-Crate domains can add independent packages without adding BIA rules to core.

The **0.1.0 packages are unpublished**. Package names remain subject to
verified `@bijux` ownership. Hosted validation runs on GitHub; shared standards
adoption, registry publication and registry-installed verification remain release
prerequisites. See the
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

The validator targets Python
[`bia-ro-crate-validator` main at `cda44ee8e9340137b409614294e0bba227bce008`](https://github.com/BioImage-Archive/bia-ro-crate-validator/tree/cda44ee8e9340137b409614294e0bba227bce008).
[Compatibility evidence](docs/compatibility/PARITY.md) defines finite corpus
coverage and operating limits. Generic RO-Crate validation for arbitrary
profiles and Python transactional editing APIs are outside this release.

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
npm run example
```

Open the localhost URL printed by `example`. Build output lives in each
package's governed `dist/`; run products, browser downloads, environments,
logs, measurements and tarballs live under root `artifacts/`.

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
are in [PARITY.md](docs/compatibility/PARITY.md). Package extension rules are in
[workspace architecture](docs/development/workspaces.md).

Apache-2.0; see [source provenance](docs/compatibility/source-provenance.md) and
package NOTICE/LICENSES for upstream code, contexts and bundled dependencies.

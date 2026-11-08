# Compatibility evidence and operating limits

## Behavioral target

Validator 0.1.0 currently targets the reviewed Python PR #23 head
`9cd5b307c328ddc99994561e44e0fff272e83001` (package 0.3.1). This deliberately
adopted provisional reference adds deterministic RDF collection rejection to
main `cda44ee8e9340137b409614294e0bba227bce008`; upstream merge is still pending. [reference.json](reference.json) records exact source
tree, lock and BIA context/ontology hashes. The current upstream validation
fixtures and registered models are copied/generated from that clean source.

The isolated oracle uses CPython 3.13.12 and the exact checked-in
[requirements](../../tests/parity/requirements-oracle.txt), including pandas
3.0.2, Pydantic 2.12.5, pydantic-core 2.41.5, PyLD 2.0.4, RDFLib 7.6.0 and
roc-validator 0.8.1. Source/import paths, clean importable files and dependency
versions are checked before capture. The entire current upstream suite passed
**82 tests**, including actual accepted ontology consistency/profile tooling.
Local Java was OpenJDK 25.0.2; the upstream ontology compiler targets 17 and CI
selects Temurin 17. Each review must pass the independent live oracle,
source/runtime matrices and all three browser engines at its exact source.
Source-specific local/hosted receipts record those results; historical runs
are not relabelled when the corpus or implementation changes.

## Known compatibility gaps

Integral floating-point JSON tokens such as `1.0`, `1e0` and `-0.0` currently
lose their numeric kind before RDF construction. Python retains a double while
JavaScript sees an integer-valued Number. A double datatype restriction can
therefore reject a crate in Python while Node approves it; integer/decimal
restrictions can produce the inverse difference. This is a release blocker.
The passing regression corpus below does not establish complete parity while
these independently reproduced cases disagree. Numeric token identity must be
preserved without changing model coercion or context-defined datatypes before
release qualification can succeed.

A separate manifest record case remains a release blocker. For the exact TSV
`file_path\tdataset\nx\t\r\r other\n`, the locked pandas parser expands a
small input into 262,145 rows and the Python validator rejects duplicate paths.
The JavaScript parser currently reads two rows and approves it. The skipped-CR
followed by a delimiter correction below does not establish correspondence for
this leading-space behavior. Its full-parser disagreement is retained in local
review evidence and must be resolved before any complete-parity claim.

## Independent differential coverage

The current corpus contains **504 crate cases**: all 13 upstream fixture
directories and 491 independently specified mutation/boundary/workload cases.
It includes metadata/context/reference failures, required profile constraints,
model coercion, quoted TSVs, missing/numeric values, chunk boundaries 262144 and
262145, duplicate findings, arbitrary-precision metadata/TSV integers, property
declarations and realistic manifests. Corpus SHA-256:

`c00fa621708df25e3eb6193d59929c091c4ed36e3181543eb1beceb1a1d07ab7`

The checked-in Python capture records 175 valid, 289 invalid and 40 incomplete
outcomes. Snapshot replay matches **504/504** on both supported Node runtimes
and through source and installed workers in Chromium, Firefox and WebKit.
Installed Node consumers run the full corpus independently on exact Node
22.23.4 and 24.3.0. Incomplete outcomes are compared; none is silently skipped.

Explicitly ambiguous `rdf:first` or `rdf:rest` cells are rejected before profile
inference, matching the reviewed Python correction. Empty, partial, cyclic and
repeated-identical arcs retain their reference behavior. Recognized numeric,
whitespace, date/time, binary and duration literal forms use RDFLib term identity for this ambiguity check. Date/time normalization
preserves each local clock and its offset as part of term identity.
XMLLiteral and HTML conversion use the pinned fragment parsing and serialization
behavior, including XML empty elements and HTML optional tags/attributes. Both
collection checks and OWL value restrictions receive the normalized terms.
[Literal identity](../development/literal-identity.md) describes the boundary.
Unparseable literals retain their original text. Boolean conversion and token
whitespace normalization retain the reference behavior. Duration formatting
retains decimal month scale, microsecond rounding and interrupted conversion
behavior. Calendar components use the pinned Decimal precision 28 and HALF_EVEN
rounding. Negative values repeat subtraction and signed carry through a new
Duration; tiny month remainders use the reference's scientific spelling, with
retained trailing scale. Positive and distinct-value controls remain separate. The same normalized literal objects reach profile inference. Context-coerced
doubles preserve invalid text, signed zero and full binary64 precision just as
explicit typed strings do; native nonintegral doubles avoid the serializer's
16-digit rounding. Preflight reference and collection checks use the default
graph, matching RDFLib Graph queries. Named graphs cannot suppress the required
profile diagnostics by triggering an unrelated early collection rejection.
Equivalent numeric and whitespace terms must satisfy OWL value restrictions;
unequal terms, including decimal spellings with different retained scales,
remain distinct. Integer conversion counts digits separately from signs and
separators. Numeric normalization uses the pinned Python Unicode 15.1.0 decimal
digit ranges, preventing a newer JavaScript engine from accepting extra digits.
The earlier main reference could approve or reject identical ambiguous inputs;
its failed qualification remains historical evidence. Fresh source and installed
qualification must use the provisional pin consistently. A future upstream merge
requires a recorded source change and independent verification before claiming
parity with accepted Python main.

The earlier runtime source `148254261633fb206e50fb7df6740557d74a1cf9` passed **2,132 tests** in
both Node 22.23.4 and 24.3.0. Current-head qualification is recorded separately,
including **1,445 independently captured model probes** plus metadata/RDF/profile,
manifest and lifecycle controls. Additional independently captured boundaries
include 68 integer coercions, 106 dates, 122 URLs, 40 profile entailment scenarios,
148 pandas column conversions, 93 record boundaries, nine TSV header allocations, 604 XSD literal identities, 134 XML/HTML identities and 24 context parsing cases. The literal capture verifies its
interpreter, source and installed
RDFLib file hashes and the default 4,300-digit integer limit. Hosted reference
validation regenerates both literal and context captures and checks the pinned
decimal digit data. After qualifying a changed Python reference, use the literal
capture's `--write-runtime-digits` flag to regenerate that runtime table.

The oracle directly calls the unmodified Python parser and accesses its result.
Expected JSON is never generated by JavaScript. The Python runner independently
hashes the complete request and the actual file bytes before and after parsing.
Source, installed and browser gates verify those byte receipts; mutation controls
reject altered, missing or extra inputs. Only the parser's exact rejection group
counts as completed rule rejection; unrelated or mixed exceptions remain incomplete.
Each fresh capture also verifies installed dependency files against wheel RECORD
hashes and records profile/ontology inputs. Local import paths stay in run
receipts and are omitted from portable checked-in snapshots. Raw reports and exception trees
are retained under artifacts. Tests of the actual Typer CLI separately show why
`--report-json` exit 0 cannot establish validity, including malformed JSON.
Comparison preserves completion status, highest severity and full
message/severity/location multisets, including duplicate findings. Narrow
normalization replaces run-root paths, known unordered diagnostic members and
one demonstrated anonymous-root identity; mutation controls prove meaningful
status/message/severity/location/count changes still fail.

This is measured finite-corpus compatibility, not proof for arbitrary JSON-LD,
all OWL rules or every pandas input. No known mismatch in a required case is
waived. A new required behavior needs independent Python capture and an actual
implementation change, rather than weaker comparison. Historical-to-current
calibration matched 149 cases independently and remains separate from current
candidate acceptance; see [baseline delta](baseline-delta.md).

## Validation semantics retained by the regression corpus

Numeric strings preserve the locked Pydantic whitespace, normalization, size and
error behavior, including its distinction between a plain integer and a cleanup
fallback. Dates preserve exact-day acceptance, range limits, fractional precision
and distinct clock/timezone diagnostics. Python JSON reader constants NaN and
Infinity reach the corresponding validation rules; quoted strings stay unchanged.
Malformed graph members and scalar graphs preserve the Python distinction
between an interrupted parse and a completed rule rejection. Root context
propagation follows ordered overrides and resets; nested contexts retain their
own behavior. Imported context caches stay within their immutable loader
snapshots, local overrides do not change the imported source, and parsed or
serialized remote responses preserve the same completion. Valid own keys such
as `__proto__` and `hasOwnProperty` remain
context terms and data properties. The bundled JSON-LD implementation receives
an [exact-version dependency patch](../development/jsonld-processing.md).

URL validation distinguishes special-scheme hosts from opaque hosts and paths.
Opaque-path backslashes do not create an authority; allowed opaque-host control
characters retain their percent-encoded representation. Invalid multi-colon
ports preserve the reference's host-before-port diagnostic precedence. The URL
capture includes every C0 character in opaque and HTTP hosts, plus IPv6,
encoded-host and malformed-port controls.

Manifest numeric inference distinguishes bare Infinity tokens from ones with
surrounding whitespace. Ordinary finite numbers retain their separate whitespace
rules. A skipped CR record consumes one following delimiter without opening an
empty field; ordinary CR, CRLF and blank-LF records retain their own behavior.
Independent record controls cover delimiters, empty fields, quoted whitespace
and header allocation. The leading-space gap above remains outside the passing
record controls and blocks release.

Manifest references can traverse selected parent directories while remaining
confined to the crate. Missing intermediate directories do not become aliases
for an existing file, and one selected entry cannot also be a directory.

Inference regressions include identity substitution, property characteristics,
class lists/restrictions, partial RDF collections, source arc ordering, schema
inheritance, reflexive identity used by value restrictions, cyclic class hierarchies and the
pinned owlrl key-rule behavior. Recognized typed literals receive datatype
memberships and supported supertypes in the same bounded rule closure. Literal-subject memberships survive target selection and constraint evaluation.
Inferred collection traversal also retains datatype and language when identifying
list nodes: equal text alone does not imply a cycle or omit later members.
Their generalized class facts do not make literals satisfy `sh:class`; plain and
explicit `xsd:string` terms both satisfy `sh:datatype xsd:string` without merging
term identity. The exact-version SHACL patch preserves those two boundaries.
Built-in `owl:Thing`/`owl:Nothing` class facts and standard annotation-property
facts are generated from the locked owlrl installation and consume the same
inference budget as other entailments. Hosted qualification regenerates these
facts, ontology, shapes and entailment expectations.
Plain strings remain distinct from explicit or context-coerced `xsd:string` values.
The exported required profile and its ontology retain their original provenance; this API remains a BIA submission validator.

## Browser and installed distribution qualification

Playwright 1.64.1 drives Chromium 156.0.8078.4, Firefox 157.0 and WebKit 27.2.
The same immutable corpus runs through the actual compiled and installed module
worker. Network interception blocks unexpected requests; all three engines
reported zero external requests/page errors in the corpus run.

The focused literal-target, built-in-axiom, double-representation and imported-
context cases also run through real ValidationSession instances. Python-invalid
or incomplete outcomes must refuse continuation; valid outcomes must hand off
identical file-byte hashes and context snapshots. Source and installed-package
receipts identify the corpus and focused-fixture hashes.

Real browser controls exercise metadata and manifest keyboard repair, unsafe
text rendered inert, truthful truncation with all 1,001 duplicate findings kept
in the raw report, edit-at-submit refusal, forced delayed success after a newer
failure, a repaired successful control, options invalidation, native worker
startup/crash/malformed replies, finite race barriers, timeout, CPU-active
termination and exact-byte handoff. The development-time WebKit upload adapter
waits for file permission before
starting native uploads; controlled protocol tests cover pending and refused
permission. Caller-defined ArrayBuffer and Blob subclasses cannot retain mutable
access to approved bytes or replace the
native payload readers. Intrinsic brand checks accept genuine cross-realm values
while rejecting fake native tags and unsupported views. Browser qualification
includes actual same-origin iframe file-picker inputs, foreign binary mutation,
Blob subclasses with zero/throwing size accessors, and consistent size, byte
length and slice content in continuation snapshots. Source and installed
consumers run those controls; offline observation is installed before the
native reader is captured. Timer budgets outside the signed platform delay range
are rejected at construction.
Offline tests observe actual Blob reads and prove unrelated image bytes remain
unread. Forced editor-read ordering, revalidation during pending metadata reads,
confined declared-manifest lookup, same-path native file/folder reselection,
empty draft repair and persisted page-event revalidation are covered; simulated
page events do not establish actual browser back/forward-cache admission. WebKit's local same-origin Blob transport is counted separately from
network fetches.

Clean tarball consumers install core alone and validator with its exact declared
core dependency. They reject source-workspace resolution, compile separate Node-only and DOM-only strict
TypeScript public root/browser/worker imports, exercise native ESM and bundled
applications, and launch actual installed workers in all three engines. The
full 504-case corpus also executes through the installed browser worker. Registry
consumers remain pending until public packages actually exist.

## Workload measurements

Measured on Darwin 25.6.0 arm64, 10 logical CPUs and 32 GiB memory, with eight edit
samples per engine. Edit feedback includes the 250 ms debounce. The manifest is
100,000 rows/two columns (2,488,908 UTF-8 bytes), including an invalid final-row
control. The wide manifest has 2,000 rows/32 columns and quoted tab values.

| Engine | Edit p95 ms | Valid manifest ms | Invalid tail ms | Wide manifest ms | Sampled process-tree peak MiB |
| --- | --- | --- | --- | --- | --- |
| chromium | 333.7 | 193.5 | 126.7 | 95.5 | 711.5 |
| firefox | 359 | 257 | 190 | 113 | 1465 |
| webkit | 338 | 218 | 179 | 108 | 346.2 |

All measured edit samples met the provisional one-second feedback budget.
These are observations, not portable performance guarantees. Memory sampling
sums RSS for the Node harness and its owned browser descendants every 100 ms;
shared pages may count more than once. This is neither worker heap nor a
guaranteed peak. Raw samples and machine/method identities are in
`artifacts/reports/workloads.json`. These measurements were refreshed with the expanded corpus at runtime source
`c2023d35560efb38c9738123d458a643606d2dc7`;
source and installed-worker differentials separately verify all workload outcomes.

Inputs are held in memory. The example's text editor is limited to 1 MiB per
selected text file; larger files can still be validated. Sessions default to a
configurable 60-second deadline and terminate workers on cancellation. Direct
`validateCrate` has no CPU deadline. Profile inference refuses more than 100,000 newly inferred quads
or 100,000 intermediate paths/list members. Property, identity, class and schema
rules share the same closure budget. Unrelated input quads do not consume it.
Checks occur before adding quads or paths; exhausted budgets produce incomplete.
The pinned ontology is generated from the actual roc-validator profile. Class
membership is materialized before cycle-safe target projection into SHACL.
Ontology declarations are processed for their relevant entailments rather than
rejected by a predicate-name allowlist. There is no silent truncation or
approval on incomplete work. Service-side validation remains the receiver's
responsibility.

## Reproduce and inspect

```sh
npm ci
npm test
npm run check:workspace
npm run check:types
bash scripts/reference/prepare.sh
artifacts/reference/python-env/bin/python scripts/reference/verify-environment.py
npm run test:parity
artifacts/reference/python-env/bin/python scripts/reference/capture-literal-identities.py --output artifacts/reports/literal-identities.json
cmp tests/parity/expected/literal-identities.json artifacts/reports/literal-identities.json
artifacts/reference/python-env/bin/python scripts/reference/capture-jsonld-contexts.py --output artifacts/reports/jsonld-contexts.json
cmp tests/parity/expected/jsonld-contexts.json artifacts/reports/jsonld-contexts.json
artifacts/reference/python-env/bin/python scripts/reference/capture-markup-identities.py --output artifacts/reports/markup-identities.json
cmp tests/parity/expected/markup-identities.json artifacts/reports/markup-identities.json
npm run test:browser
node tests/browser/continuation-parity.mjs
node tests/browser/native-file-values.mjs
node tests/package/native-inputs.mjs
npm run test:live
node tests/browser/races.mjs
node tests/browser/draft-editor.mjs
node tests/browser/offline.mjs
node tests/browser/report-display.mjs
npm run test:workload
npm run test:pack
```

Create root `artifacts/work` before setting TMPDIR there. Install browser assets
under absolute root `artifacts/tools/browsers` and set PLAYWRIGHT_BROWSERS_PATH.
The reference preparation requires CPython 3.13.12 and uv 0.11.17; upstream 82-test
qualification additionally needs the accepted ontology tooling (`check_ontology.py
--install`) and Java. CI contains exact commands and pinned action references.
Run actionlint on `.github/workflows/*.yml`, `make bijux-std-checks` and
`make bijux-standard-check`. A checked-in snapshot is development replay support,
not replacement evidence for a fresh live candidate differential.

Run products under `artifacts/logs/`, `artifacts/reports/` and
`artifacts/packages/` include raw oracle output, environment identity, live and
`source-live-parity.json`, `source-snapshot-parity.json` and
`installed-snapshot-parity.json`, race/offline/repair reports, measurements, package
inventories and archive integrity. Final source/tree/lock/archive identities
are captured alongside the release handoff. Local logs and hosted check receipts identify the tested source. Before public
release, freeze and requalify final accepted main and retain the exact archive
identities. Registry installations and publication/provenance receipts remain
pending.
Shared governance is [adopted from its exact accepted source](../development/standards-adoption.md).
The publisher remains disabled; registry ownership and release setup are separate prerequisites.

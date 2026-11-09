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

Selected files do not identify a physical parent directory. Used default-graph
RDF identities that escape the selected crate through a relative base or path
therefore return `incomplete`, with continuation disabled. Python can resolve
those identities against its actual filesystem hierarchy. Separate
[reference characterizations](../../tests/reference/physical-base/expected.json)
retain that distinction outside the passing parity corpus. Explicit absolute
bases, rooted paths and ignored RDF identities do not cause this refusal.
This selected-input boundary remains outside exact Python agreement.

Pandas wheel builds can also infer different numeric file identities through
fused versus separate decimal accumulation. [Numeric identity](manifest-numeric-identity.md)
returns `incomplete` when those interpretations change file-list findings,
interruptions or inbound references. A separate required eleven-case suite
checks portable refusals and agreeing controls. Unused or discarded numeric
values do not cause refusal. This is an explicit incomplete-input boundary,
separate from confirmed upstream defects and ordinary exact agreement.

Used inferred collections with multiple complete branches or additional lengths
through described `rdf:nil` also return `incomplete`, with continuation disabled.
Dead branches and nonproductive descriptions do not trigger this bound. These
operating limits remain part of qualification; packages remain unpublished.

Confirmed Python reporting, converter and recursive-diagnostic defects are
[documented exceptions](UPSTREAM.md). Node corrects those defects instead of
reproducing them. The separate required **Upstream defect guards** job checks
102 cases, including valid counterparts; 42 intentionally differ from Python.
Original reports remain recorded. These exceptions are outside the ordinary
strict agreement corpus and do not authorize a claim of identical Python behavior.

Root nonpropagating contexts use context reversion instead of reproducing
RDFLib's missing-parent crash. Separate [root-context contracts](../../tests/reference/root-context-propagation/README.md)
retain original Python outcomes and exact independently equivalent counterpart
reports. These approved corrections are separate from ordinary strict parity.

[Literal grammar contracts](../../tests/reference/literal-grammar/checks.mjs)
separately qualify 62 inputs and 32 intentional reference differences. HTML
ruby/search/dialog boundaries use a hash-bound, isolated Python grammar correction,
browser DOM comparisons and recorded reference parse-error traces. XML Fifth Edition names use exact
unchanged-Python ASCII-name counterparts; Expat's declared Fourth Edition support
is an edition boundary. Original captures remain intact. These cases run through
source/installed Node 22/24 and browser Sessions outside ordinary agreement.

[Inferred collection contracts](../../tests/reference/inferred-collections/README.md)
require complete list operands and all member-position pairs. Finite productive
branch/cycle relations also support additional witness lengths through described
`rdf:nil`. The separate 138 cases contain 41 explicit corrections and 97 unchanged
controls; every registered case completes. Fourteen source registrations and their original reference records
remain preserved there, rather than being counted as exact ordinary agreement.

[Collection diagnostic contracts](../../tests/reference/collection-diagnostics/README.md)
retain twelve unchanged controls, including three valid crates. Three cyclic
focuses expose Python rendering and report-cloning failures that lose required
findings; Node retains the rejection with a bounded cycle marker. Original
approvals and isolated corrected reports remain separate.

## Independent differential coverage

The current corpus contains **1429 crate cases**: all 13 upstream fixture
directories and 1416 independently specified mutation/boundary/workload cases.
It includes metadata/context/reference failures, required profile constraints,
model coercion, quoted TSVs, missing/numeric values, chunk boundaries 262144 and
262145, duplicate findings, arbitrary-precision metadata/TSV integers, property
declarations and realistic manifests. Corpus SHA-256:

`1ca364a2c41a2a227161f5564db17d04225c62ef5843bb82280f0d0a3e27fe56`

The checked-in Python capture records 532 valid, 802 invalid and 95 incomplete
outcomes. Snapshot replay covers all **1429/1429** cases. Candidate acceptance
requires a fresh source differential against Python, source and installed
consumers on both Node versions, and all 1429 cases through source and installed
workers in Chromium, Firefox and WebKit. The source and installed Session
continuation suite contains 1004 cases per engine with explicit core-module
bindings. Input-byte receipts and complete findings remain mandatory. The separate
upstream-defect guards must also pass; ordinary agreement alone is insufficient.
Incomplete outcomes are compared; none is silently skipped.

TSV record replay retains the pinned tokenizer’s byte, field and line storage
limits, including BOM reservation, padding and low-memory drains. Capacity
exhaustion returns incomplete with the original interruption; successful replay
continues to completion. Independent row hashes cover 222 token streams, and
five complete crates retain the resulting status and full report.

Tokenizer storage and column inference share the same floored width quotient
when selecting low-memory chunks. Nineteen complete crates retain signed/unsigned
path identities around physical widths 2046–2049 and row boundaries 256 and 512,
including implicit indexes and undeclared-column interruptions.

[JSON-LD container controls](../../tests/reference/jsonld-containers/README.md)
retain graph-container linking edges and complete type-map processing. Twenty-eight
whole crates match unchanged Python reports; independent standard expansions and
RDF type identifiers qualify base resolution, null indices and isolated caches.

Imported context keywords retain separate RDFLib and PyLD semantics. RDF imports
ignore every base in the import object, including local overrides; metadata
processing retains PyLD's keyword ordering, relative initial bases and missing
default interruptions. Twenty-eight independently captured mode fixtures and
[25 complete-crate captures](../../tests/parity/inputs/imported-context-keywords.json)
cover completion and full findings, including valid imports and actual profile
rejections before later metadata failure. Context responses remain immutable
across reused and concurrent mode caches.

Selected-crate RDF roots use private per-validation identities. Absolute input
IRIs retain their identities, while public findings and incomplete reasons render
generated addresses deterministically. The comparator preserves literal
`file:///crate/` input addresses. [Crate identity](../development/crate-identity.md)
describes the boundary and source/installed browser guards.

Thirty-two complete captures cover namespace labels for named Dataset and typed
string targets, aliases, default-prefix restoration, source key order, imports,
resets, local scopes, invalid IRIs and pinned Unicode boundaries. An independent
Graph/stringifier capture verifies 30 binding scenarios and 618 exact URI labels;
ordered binding receipts and all-codepoint Unicode predicate digests retain the
full reference decisions. [Namespace labels](../development/rdf-namespace-labels.md)
describes their scope and reproducible capture.

An optional manifest name lookup runs only for a nonempty declared column name.
An empty declaration leaves references to the file-path lookup; a nonempty name
still requires its table column even when its reference cells are empty.

Model type-list diagnostics use the same pinned Python string representation as
manifest diagnostics. [Complete-crate controls](../../tests/parity/inputs/model-type-diagnostics.json)
retain apostrophe quoting and TAB, LF and NEL escapes, plus scalar interpolation,
backslashes and recognized-type counterparts. Model selection, list order and
validation outcomes remain unchanged.

Date, integer and URL strings reject lone UTF-16 surrogates before syntax parsing.
[Date controls](../../tests/parity/inputs/metadata-date-unicode.json) distinguish
escaped lone surrogates from valid surrogate pairs in valid UTF-8 JSON text.
[Integer controls](../../tests/parity/inputs/metadata-integer-unicode.json) preserve
that precedence for `Publication.yearPublished`, with ordinary integer and
well-formed Unicode syntax-error counterparts.
Date and clock bounds then use UTF-8 byte lengths before component diagnostics.
[Whole-crate controls](../../tests/parity/inputs/date-byte-boundaries.json)
exercise optional `dateModified`, which reaches model parsing without an earlier
profile date rejection, with short ASCII/Unicode and valid-midnight counterparts.

URL model parsing uses a pinned JavaScript URL state machine and Unicode 15.1
domain mappings. [URL controls](../development/url-parsing.md) retain complete
errors for malformed ACE labels, mapped IPv4 addresses and lone surrogates,
while preserving opaque hosts, file drives and query/fragment normalization.
[File-host controls](../../tests/parity/inputs/metadata-file-authorities.json)
retain literal at-signs when selecting IPv6 and international-domain diagnostics;
other URL schemes retain their userinfo handling.

Generic data-entity targeting preserves every metadata-descriptor/root binding,
including multiple descriptors sharing a root. Each binding excludes its own
descriptor from generic membership. Profile findings retain distinct RDF values
when their text matches but their datatype or language differs; repeated equal
terms still coalesce. Nine independent captures cover these decisions and their
controls.

Thirteen complete captures and twelve additional independent entailment
scenarios cover blank-predicate inference and cleanup, initial datatype/equality
maps and self-equivalence guards. They preserve both inferred missing-name
findings and agreeing valid controls. Blank predicates never escape the completed
closure; type-driven reflexive axioms remain distinct from equivalence rules.

An additional 49 complete-crate captures retain native integer/float token
boundaries, scalar model coercion, and escaped strings that resemble internal
non-finite-number markers. Their original bytes and Python reports remain
independent of the validator implementation.

Manifest interpretation controls cover post-expansion path/name joins, singleton
list-valued target types, interrupted self-reference findings and exponent zero
signs. Forty-nine complete captures retain duplicate-path and metadata findings,
scalar and list controls, quotes, Unicode and computed-exponent boundaries. The
string-list formatter separately matches the pinned Python representation of
every Unicode codepoint. [Manifest values](../development/manifest-values.md)
describes these ownership and conversion rules.

Seven complete selected-file controls cover literal, dot-prefixed, nested and
percent-encoded colon names. Workspace operations resolve selected local paths
without URI classification or network lookup. Leading slashes, Windows drive-absolute spellings, backslashes, NUL,
traversal outside the crate and normalized selection collisions remain rejected. Source and installed browser consumers also use real
native directory selection for three colon-name cases per engine, checking full reports and exact
continuation bytes. [Core inputs](../../packages/core/README.md) describes the
local-path boundary; callers classify external references before decoding them.

Selected names and file text must encode to UTF-8 without replacing unpaired
UTF-16 surrogates. Malformed raw strings return `incomplete`; JSON escape
sequences and paired Unicode remain supported. A current draft rejected at
this boundary stays ineligible across retries and option changes until corrected.
[Core inputs](../../packages/core/README.md) describes this byte-ownership boundary.

Explicit blank-node labels survive RDF construction and cannot alias anonymous
nodes or collection cells. The bare `_:` retains its reference URI identity.
Nine independently captured complete crates retain strict focus locations;
standard JSON-LD conversion keeps its default identifier issuer.

Explicitly ambiguous `rdf:first` or `rdf:rest` cells are rejected before profile
inference, matching the reviewed Python correction. Empty, partial, cyclic and
repeated-identical arcs retain their reference behavior. Recognized numeric,
whitespace, date/time, binary and duration literal forms use RDFLib term identity for this ambiguity check. Date/time normalization
preserves each local clock and its offset as part of term identity.
XMLLiteral and HTML conversion use the pinned fragment parsing and serialization
behavior, including XML empty elements and HTML optional tags/attributes. Both
collection checks and OWL value restrictions receive the normalized terms.
Complete-crate controls retain strict HTML failures, scripting-disabled noscript
content, XML 1.0 line endings and rejected namespace values.
[Literal identity](../development/literal-identity.md) describes the boundary.
Unparseable literals retain their original text. Boolean conversion and token
whitespace normalization retain the reference behavior. Duration formatting
retains decimal month scale, microsecond rounding and interrupted conversion
behavior. Calendar components use the pinned Decimal precision 28 and HALF_EVEN
rounding. Negative values repeat subtraction and signed carry through a new
Duration; tiny month remainders use the reference's scientific spelling, with
retained trailing scale. Positive and distinct-value controls remain separate. The same normalized literal objects reach profile inference. Context-coerced
doubles preserve invalid text, signed zero and full binary64 precision just as
explicit typed strings do. Native JSON numbers preserve their original integer
or floating-point kind, including `1.0`, `1e0` and `-0.0`, without changing the
primitive values used by model validation. Native RDF values retain Python
constructor spellings separately from explicit typed-string conversion;
collection identity does not canonicalize those native spellings a second time.
JSON literals retain the reference's numeric kinds, Unicode key ordering and
escaping. Internal datatype markers are reserved against expanded IRIs so that
context prefixes cannot make a user datatype collide with them.
Property-scoped contexts retain the parent property's coercion and apply child
aliases to its values. Type-scoped contexts use the first recognized input
type, including an unscoped type, and preserve nonpropagation to child nodes.
An opt-in RDF expansion mode preserves that reference behavior; metadata/model
processing continues to use standard JSON-LD type scoping. Scoped JSON payloads
retain reserved keys without serializing internal wrapper fields.
Explicit JSON value objects require a real `@type` key or context alias. An
ordinary property named `undefined` cannot supply a missing type; a legitimate
`undefined` alias for `@type` retains its meaning.

Context-coerced JSON literals take priority over container and property-index
behavior during RDF conversion. Objects and nested arrays in a container still
interrupt RDF context loading, matching RDFLib's initial set construction.
Metadata/model processing retains PyLD's scalar-container normalization, so
null, false and zero remain invalid mappings at that boundary. Separate resolver
caches prevent RDF mappings from relaxing the later metadata/model checks.
The [container regressions](../../tests/parity/inputs/json-literal-containers.json)
compare full completion and findings, including format rejections that precede
metadata context validation. Fifty-one additional controls exercise cold and
reused caches across inline, remote, imported, property-scoped and type-scoped
contexts, parsed/serialized responses and concurrent processing.

Explicit relative context mappings retain RDFLib's raw predicate and literal
datatype IRIs while resolving node references against their active base. Null
bases preserve the pinned path-normalization and colon-retention boundary;
empty datatype aliases retain their distinct identity. Separate RDF processing
leaves later standard metadata/model context rejection intact. The
[relative-context corpus](../../tests/parity/inputs/relative-contexts.json)
records 39 complete-parser outcomes; 131 independently captured RDF mapping and
interrupted-parsing controls cover aliases, coercions, reverse mappings, imports,
scoped contexts, native numeric/boolean values and URI authority rejection.
Cache-isolation tests retain standard JSON-LD behavior.

ID-only node objects leave a nonpropagating type scope, while scalar ID coercion
resolves before that boundary and property scopes retain their inherited terms.
Empty node-local contexts reset terms; literal-local contexts are ignored.
Twenty additional Graph controls and
[14 complete-parser captures](../../tests/parity/inputs/scoped-references.json)
retain these distinctions, including native numeric/JSON values. Independent
PyLD expansion controls preserve standard metadata/model behavior.

Preflight reference and collection checks use the default
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

Candidate qualification runs the full suites on Node 22.23.4 and 24.3.0,
including **1,445 independently captured model probes** plus metadata/RDF/profile,
manifest and lifecycle controls. Additional independently captured boundaries
include 68 integer coercions, 128 dates, 373 URLs, 52 profile entailment scenarios,
192 pandas column conversions, 93 record boundaries, 222 complete tokenizer
record hashes/errors, nine TSV header allocations,
604 XSD literal identities, 438 XML/HTML identities, 364 native numeric/JSON
term identities, 23 context parsing cases and 22 direct metadata parsing cases.
The literal capture verifies its
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
one demonstrated anonymous-root identity. Opt-in OWL fixtures also retain receipts
for blank nodes created by the original pinned closure, with exact error literals.
A restored observer records those facts without changing the closure's return or
exception; separate unobserved full-parser runs retain the same completion,
findings and counts. Only proven generated focus identities receive a mapping;
preexisting or unknown blank nodes and diagnostic text stay strict. Mutation
controls prove meaningful status/message/severity/location/count changes still fail.

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
Infinity reach the corresponding validation rules; quoted strings stay unchanged,
including escaped strings that decode to an internal numeric marker. Numeric
conversion requires the exact raw token emitted by the constant lexer; a
runtime without token-source support refuses the conversion.
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
Whitespace backtracking preserves replay at tokenizer-call and Unicode-buffer
boundaries, including the reference's 262,145-row expansion for a tiny CR/space
input. Width checks retain buffered-state behavior around low-memory drains.
Independent record controls cover delimiters, empty fields, quoted whitespace,
header allocation, Unicode/BOM input buffers and row-budget boundaries.
[Manifest record buffering](../development/manifest-records.md) explains the
lexical boundary and independent capture.

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
Vocabulary class/datatype constants require NamedNode identity, even when a literal
has identical text. Datatype disjointness activates only for types used by the
initial graph, including supported datatype supertypes.
Cardinality restrictions compare the RDFLib constructor value: a numeric or boolean
one differs from the string "1". Native numbers can retain that value even when
coerced to a string datatype. Equal triples keep the first constructor value;
unrelated equal terms do not share that receipt. Source member order survives
predicate aliases, including numeric-looking and escaped keys. Fourteen complete
captures cover ordinary and qualified cardinality under reversed alias order.
OWL inconsistency rules emit the pinned ErrorMessage type and plain error literal
after closure, before profile target evaluation. The regression cases exercise
identity/class/property conflicts, negative assertions and zero cardinalities,
including the locked list-rule bounds. A separate 196-case Python capture checks
lexical error classification. Only converter ValueError produces an error node;
proven decimal InvalidOperation and empty-temporal IndexError leave other Node
profile checks active. Temporal field patterns are exported from pinned CPython
strptime, preserving its asymmetric ASCII/Unicode digits and space-padded fields.
Unicode word checks use the captured Python 15.1 category table. Whitespace,
hexadecimal prefixes, URI authority checks and fractional suffixes retain the
locked converter boundaries; floating-point text rejects nondecimal radix prefixes.
Decimal conversion trims original outer whitespace before removing underscores, so
underscores cannot expose interior padding and suppress datatype findings. Seventy-one
complete crates and fifty-four additional primitive captures retain that boundary.
The locked base allValuesFrom typing hook always accepts
and therefore contributes no inconsistency message.
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

Session ownership controls also resolve the selected Session module and its
external core dependency from the same distribution. Installed controls record
that core request and reject fallback to source core. Native-worker reentrancy
controls cover selection, edits, options, revalidation, cancellation, completion,
failure, replacement deadlines and disposal. They hold replacement replies,
refuse premature continuation and verify exact current bytes and options in handoff.
[Session lifecycle](../development/session-lifecycle.md) describes these invariants.


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
full corpus also executes through the installed browser worker. Registry
consumers remain pending until public packages actually exist.

## Workload measurements

Measured on Darwin 25.6.0 arm64, 10 logical CPUs and 32 GiB memory, with eight edit
samples per engine. Edit feedback includes the 250 ms debounce. The manifest is
100,000 rows/two columns (2,488,908 UTF-8 bytes), including an invalid final-row
control. The wide manifest has 2,000 rows/32 columns and quoted tab values.

| Engine | Edit p95 ms | Valid manifest ms | Invalid tail ms | Wide manifest ms | Sampled process-tree peak MiB |
| --- | --- | --- | --- | --- | --- |
| chromium | 363.3 | 291.6 | 197.9 | 130.1 | 747.5 |
| firefox | 439 | 320 | 256 | 147 | 1484.8 |
| webkit | 384 | 244 | 182 | 125 | 322.1 |

All measured edit samples met the provisional one-second feedback budget.
These are observations, not portable performance guarantees. Memory sampling
sums RSS for the Node harness and its owned browser descendants every 100 ms;
shared pages may count more than once. This is neither worker heap nor a
guaranteed peak. Raw samples and machine/method identities are in
`artifacts/reports/workloads.json`. These measurements were captured at runtime source
`83f71d1b42086b7898cf3e755b7f4b092544c433`;
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
artifacts/reference/python-env/bin/python scripts/reference/capture-json-number-terms.py --output artifacts/reports/json-number-terms.json
cmp tests/parity/expected/json-number-terms.json artifacts/reports/json-number-terms.json
artifacts/reference/python-env/bin/python scripts/reference/capture-tokenizer-records.py --output artifacts/reports/tokenizer-records.json
cmp tests/parity/expected/tokenizer-records.json artifacts/reports/tokenizer-records.json
npm run test:browser
node tests/browser/continuation-parity.mjs
node tests/browser/native-file-values.mjs
node tests/package/native-inputs.mjs
npm run test:live
node tests/browser/races.mjs
node tests/browser/session/termination.mjs
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

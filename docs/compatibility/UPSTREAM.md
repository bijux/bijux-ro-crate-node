# Confirmed upstream defects

Ordinary differential tests require exact reports from the pinned Python source.
A separate required **Upstream defect guards** job covers independently proven
Python defects. Node preserves correct validation rather than reproducing them.

| Python defect | Node contract |
| --- | --- |
| Six typed-literal reporting failures approve Dataset constraint violations | Retain the required inverse `hasPart` rejection |
| Decimal/date conversion failures approve an unnamed WebSite | Retain the required WebSite name rejection |
| Disabled JSON-LD terms crash context parsing | Preserve disabled custom terms and BIA field-remapping checks |
| Blank-node messages depend on Python object identity and shared traversal state | Use RDF equality and deterministic per-focus rendering |
| Root nonpropagating contexts dereference a missing parent | Use actual context reversion and exact independently equivalent Python counterparts |
| Empty userinfo at EOF permits a missing URL host | Reject the authority as required by the URL Standard |
| Non-special URL ports accept backslash termination | Reject the invalid port while retaining special-scheme controls |
| Broad temporal conversion normalizes three non-XSD spellings | Preserve distinct RDF terms and required datatype findings |
| OWL keys omit the final shared-property comparison | Require a shared value at every key position |
| Signed-minimum integers collide with the C parser’s missing sentinel | Preserve the genuine path and its distinct missing cell |
| Implicit-index chunk warnings index an absent header name | Complete validation with the computed values and original index |

The [guard suite](../../tests/reference/upstream-defects/checks.mjs) contains
111 cases, including valid counterparts. Forty-eight intentionally differ from Python.
Original Python reports and input hashes remain recorded separately from Node.
Diagnostic corrections are also checked against an isolated, hash-bound Python
formatter correction; the installed Python source is untouched. Constraint
corrections require the complete explicit finding contract, including metadata
findings, severity and location; extra findings also fail.
[Root-context contracts](../../tests/reference/root-context-propagation/README.md) preserve the original crashes, required rejections and exact counterpart reports.
Source and installed Node validators and browser Sessions run the same guards.
[Temporal contracts](../../tests/reference/temporal-literals/README.md) retain nine exact
inputs, six independently corrected rejections and three unchanged controls.
[URL authority contracts](../../tests/reference/url-authorities/README.md) retain
five Python approvals and 22 agreeing controls; exact rejected counterparts
qualify both parser corrections without changing the original fifty guards.
[Key equality contracts](../../tests/reference/key-equality/README.md) preserve
six false approvals and ten unchanged controls. Their isolated Python correction
changes only the omitted final-position test; the original primitive query and
all 138 collection reports remain recorded unchanged.
[Manifest inference contracts](../../tests/reference/manifest-inference/README.md) retain
nine original reports and scoped pandas counterparts. Three intentionally differ:
two false duplicate-path rejections and one warning-rendering interruption. Full
frame/index proofs, source hashes and wheel integrity checks qualify both mechanisms;
six controls remain unchanged.

These are documented compatibility exceptions, not passing exact-parity cases.
A new disagreement must be investigated before entering this suite; a Node bug
must be fixed in Node. An upstream fix requires fresh qualification before an
exception is removed. Passing these finite tests does not establish universal
correctness. Packages remain unpublished.

[Inferred collection contracts](../../tests/reference/inferred-collections/README.md)
separately correct partial-list entailments, truth-value-dependent literal-cell
traversal and omitted member pairs. Finite relations handle productive branches
and cycles without enumerating witness lengths. Their 138 cases retain 41
explicit reference differences and 97 unchanged controls; all complete. Original
reference captures remain preserved outside the defect guards above.

[Collection diagnostic contracts](../../tests/reference/collection-diagnostics/README.md)
retain twelve unchanged controls, including three valid crates. Three cyclic
focuses expose Python rendering and report-cloning failures that lose required
findings; Node retains the rejection with a bounded cycle marker. Original
approvals and isolated corrected reports remain separate.

[Literal grammar qualifications](../../tests/reference/literal-grammar/checks.mjs)
remain separate: 62 cases cover bounded HTML tree-building corrections and the
XML Fourth/Fifth Edition name boundary, with 32 intentional differences. Original
Python captures, independent grammar evidence and exact counterpart contracts
are retained; these cases do not increase ordinary agreement or the 111 defect
guards above.

[Compatibility limits](PARITY.md) separately record the provisional reference
and browser inputs whose RDF identities depend on an unknown physical parent.
Missing input is not a Python bug; those results remain `incomplete` and cannot
continue.

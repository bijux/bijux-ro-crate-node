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

The [guard suite](../../tests/reference/upstream-defects/checks.mjs) contains
50 cases, including valid counterparts. Twenty-eight intentionally differ from Python.
Original Python reports and input hashes remain recorded separately from Node.
Diagnostic corrections are also checked against an isolated, hash-bound Python
formatter correction; the installed Python source is untouched. Constraint
corrections require the complete explicit finding contract, including metadata
findings, severity and location; extra findings also fail.
[Root-context contracts](../../tests/reference/root-context-propagation/README.md) preserve the original crashes, required rejections and exact counterpart reports.
Source and installed Node validators and browser Sessions run the same guards.

These are documented compatibility exceptions, not passing exact-parity cases.
A new disagreement must be investigated before entering this suite; a Node bug
must be fixed in Node. An upstream fix requires fresh qualification before an
exception is removed. Passing these finite tests does not establish universal
correctness. Packages remain unpublished.

[Inferred collection contracts](../../tests/reference/inferred-collections/README.md)
separately correct partial-list entailments, truth-value-dependent literal-cell
traversal and omitted member pairs. Their 125 cases retain 36 explicit reference
differences, 86 unchanged controls and three incomplete branching limits. Original
reference captures remain preserved; the 50 defect guards above stay unchanged.

[Collection diagnostic contracts](../../tests/reference/collection-diagnostics/README.md)
retain twelve unchanged controls, including three valid crates. Three cyclic
focuses expose Python rendering and report-cloning failures that lose required
findings; Node retains the rejection with a bounded cycle marker. Original
approvals and isolated corrected reports remain separate.

[Literal grammar qualifications](../../tests/reference/literal-grammar/checks.mjs)
remain separate: 62 cases cover bounded HTML tree-building corrections and the
XML Fourth/Fifth Edition name boundary, with 32 intentional differences. Original
Python captures, independent grammar evidence and exact counterpart contracts
are retained; these cases do not increase ordinary agreement or the 50 defect
guards above.

[Compatibility limits](PARITY.md) separately record the provisional reference
and browser inputs whose RDF identities depend on an unknown physical parent.
Missing input is not a Python bug; those results remain `incomplete` and cannot
continue.

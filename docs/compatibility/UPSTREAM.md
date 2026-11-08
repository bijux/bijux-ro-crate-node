# Confirmed upstream defects

Ordinary differential tests require exact reports from the pinned Python source.
A separate required **Upstream defect guards** job covers independently proven
Python defects. Node preserves correct validation rather than reproducing them.

| Python defect | Node contract |
| --- | --- |
| Six typed-literal reporting failures approve Dataset constraint violations | Retain the required inverse `hasPart` rejection |
| Decimal/date conversion failures approve an unnamed WebSite | Retain the required WebSite name rejection |
| Blank-node messages depend on Python object identity and shared traversal state | Use RDF equality and deterministic per-focus rendering |

The [guard suite](../../tests/reference/upstream-defects/checks.mjs) contains
23 cases, including valid counterparts. Twelve intentionally differ from Python.
Original Python reports and input hashes remain recorded separately from Node.
Diagnostic corrections are also checked against an isolated, hash-bound Python
formatter correction; the installed Python source is untouched. Constraint
corrections require the complete explicit finding contract, including metadata
findings, severity and location; extra findings also fail.
Source and installed Node validators and browser Sessions run the same guards.

These are documented compatibility exceptions, not passing exact-parity cases.
A new disagreement must be investigated before entering this suite; a Node bug
must be fixed in Node. An upstream fix requires fresh qualification before an
exception is removed. Passing these finite tests does not establish universal
correctness. Packages remain unpublished.

[Compatibility limits](PARITY.md) separately record the provisional reference
and browser inputs whose RDF identities depend on an unknown physical parent.
Missing input is not a Python bug; those results remain `incomplete` and cannot
continue.

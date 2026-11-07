# Historical-to-current baseline calibration

The historical Python source `89b5b71fa4e821bcdeef55e8469d7aecef3dec44`
and accepted source `cda44ee8e9340137b409614294e0bba227bce008`
were independently executed on the same 149 frozen crate cases with locked
runtime dependencies and CPython 3.13.12. Complete normalized reports and
completion status matched in all 149 cases: 32 valid, 96 invalid, 21 incomplete.

The accepted source's full upstream suite also passed: 71 tests, including
actual pinned ontology profile/consistency tooling. The earlier preview's
historical test count is not the count of the current source.

The source delta includes ontology changes and required development tooling.
Equal results on this corpus do not imply semantic equivalence for every
possible input or establish parity of the JavaScript implementation. The Node
and browser implementations require their own current-source differentials.
Raw run products are retained under repository artifacts, with source and
corpus identities recorded in each report.

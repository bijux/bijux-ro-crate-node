# Validation source provenance

The BIA behavioral target is reviewed Python PR #23 at
`9cd5b307c328ddc99994561e44e0fff272e83001`, explicitly adopted before upstream
merge. Its base main is `cda44ee8e9340137b409614294e0bba227bce008`. Its source tree, lock and
semantic-input hashes are recorded in [reference.json](reference.json).

The implementation selectively reuses the supplied independent browser port
at `5e286b4c85a39d91e06980f7ff92361429ce4cfa`, which targeted Python
`89b5b71fa4e821bcdeef55e8469d7aecef3dec44`. Reused boundaries include
JSON-LD/RDF compatibility, BIA model interpretation, required base-profile
checks, pandas-compatible TSV parsing and independently generated probes.
Historical reports and test counts are not release acceptance for this source.

The accepted Python delta includes ontology declarations and mandatory
OWL profile/consistency test tooling. The parser and dependency lock are
compared independently; unchanged parser source does not establish unchanged
semantic outcomes. Fresh locked Python results remain the oracle.

Reusable crate inputs, trusted resource ownership and generic diagnostics
belong to core. BIA-specific resources, completion rules and browser job
composition belong to validator. The original planning files and assistant
configuration are not part of either package.

BIA-derived code retains its Apache-2.0 notices. Required profile checks derive
from roc-validator 0.8.1. The bundled RO-Crate 1.1 context is CC0; its SHA-256 is
`4a8c4cbdfd73d3d11be5ebe135f6122a0fc711fd1433e4258a748c80cc257ab7`.
Pandas-inspired conversion behavior retains the supplied BSD notices.
Distribution builds retain licenses for every bundled runtime dependency.

Profile inference includes modified JavaScript adaptations of
[owlrl 7.1.4](https://github.com/RDFLib/OWL-RL/tree/7.1.4), with its W3C notice in
`packages/validator/LICENSES/owlrl.txt`. Model integer normalization follows the
[pinned Pydantic core parser](https://github.com/pydantic/pydantic-core/blob/v2.41.5/src/input/shared.rs);
date clock/timezone parsing follows
[speedate 0.17.0](https://github.com/pydantic/speedate/tree/v0.17.0).
Their MIT notices are retained in the validator's LICENSES directory and NOTICE.
The generated profile ontology and constraints come from roc-validator 0.8.1;
independent Pydantic/owlrl query captures remain development evidence.

Fresh oracle captures check installed distribution bytes against wheel RECORD
hashes and fingerprint the profile/inference resources. The actual Python
source/import path and versions are recorded alongside each run. Independent
request and actual-file digests bind expected outcomes to the submitted bytes.

Initial npm identities are `@bijux/ro-crate-core` and
`@bijux/ro-crate-validator`, each 0.1.0. They remain unpublished until
package ownership, registry authorization and release qualification are established.

The collection guard follows RDFLib 7.6.0 literal identity after lexical normalization.
The Python correction changes only reference validation and parser regressions;
model definitions, dependency lock, context and ontology bytes are unchanged.
Existing model probes retain their original capture identity and are reused
only after verification of those unchanged inputs.

OWL lexical error classification retains the pinned owlrl converter boundaries.
Temporal field expressions are generated from CPython 3.13.12's `_strptime`;
URI authority checks follow its `urllib.parse`. Unicode word and RDF name
predicates use independently captured Python 15.1 categories. CPython and RDFLib
notices ship in the validator's `LICENSES` directory.

Independent crate captures clear PyLD's resolved-context and inverse-context
caches before each parse. Imported context mutations must not leak between
fixtures. Order and repetition regressions are checked against separate-process
qualification using identical input bytes.

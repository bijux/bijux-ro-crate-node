# Validation source provenance

The BIA behavioral target is accepted Python main at
`cda44ee8e9340137b409614294e0bba227bce008`. Its source tree, lock and
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

Initial npm identities are `@bijux/ro-crate-core` and
`@bijux/ro-crate-validator`, each 0.1.0. They remain unpublished until
package ownership, registry authorization and release qualification are established.

# Cyclic blank-node diagnostics

This complete crate contains a blank MediaObject/Publication with a property
pointing back to itself and no inbound `schema:hasPart`. Both validators reject
the missing inbound relation. Their inverse-path message text still differs.
Recursive equality involving distinct blank nodes can also produce different
text. This Node diagnostic compatibility gap blocks complete parity and
publication. It is separate from upstream fail-open validation failures.

The pinned pySHACL formatter expands a blank node into its outgoing facts. Its
`owl:sameAs` self shortcut tests Python object identity, while its recursion cache
keys equal blank nodes by their lexical label. Distinct constructor occurrences
therefore affect recursive text even when the RDF graph is equal. Node currently
uses RDF term equality for that shortcut and emits a shorter recursive message
for the retained self-reference.
Repeated captures with the pinned hash seed reproduce the Python message exactly;
these observations do not establish an unstable reference result.

[inputs.json](inputs.json) retains the exact crate bytes and
[expected.json](expected.json) retains the complete independent Python report.
The case stays outside ordinary passing parity discovery. The strict comparator
continues to report its message mismatch; no message normalization waives it.

Recapture with the untouched locked Python environment:

```sh
PYTHONHASHSEED=0 PYTHONDONTWRITEBYTECODE=1 artifacts/reference/python-env/bin/python tests/parity/oracle.py < tests/reference/blank-node-diagnostics/inputs.json > artifacts/reports/blank-node-diagnostics.json
node tests/reference/blank-node-diagnostics/verify-capture.mjs artifacts/reports/blank-node-diagnostics.json
```

Resolution requires a constructor-occurrence and graph-iteration model justified
by fresh reference traces, followed by exact source, installed and browser report
checks. The characterized case can then join the passing corpus. Different hash
seeds must be distinguished from repeated results under the pinned environment.

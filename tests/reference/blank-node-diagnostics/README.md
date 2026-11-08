# RDF diagnostic corrections

PySHACL 0.31.0 uses Python object identity for its `owl:sameAs` self shortcut.
RDF-equal terms in the same graph can therefore produce different diagnostics.
Its shared cache can also make recursive text depend on focus traversal order.
`capture.py --prove` reproduces the identity defect without changing Python files.

Node uses RDF term equality, canonical traversal and a cache scoped to each focus.
Both validators reject the four defective crates. The valid inbound counterpart
still succeeds. These confirmed upstream defects are separate from ordinary
strict parity; Node preserves the correct graph behavior instead of the defects.

[expected.json](expected.json) retains untouched Python results.
[corrected.json](corrected.json) comes from the separate `capture.py --corrected`
reference: it changes only the self shortcut, cache scope and traversal order in
memory. [correction.json](correction.json) pins the original function's source
hash and package version. Input bytes, validation outcomes, findings and
severities remain unchanged; only the affected diagnostic text changes.

The ordinary comparator is unchanged. The corrected contract is checked exactly
through source and installed validators and browser continuation guards. An
upstream change requires fresh qualification before removing the exception.

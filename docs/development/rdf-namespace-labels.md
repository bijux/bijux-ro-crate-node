# RDF namespace labels in profile findings

Inverse-path findings render named nodes and literal datatype IRIs with the
pinned Python namespace rules. With `ex` bound to `https://example.org/`, a named
Dataset can appear as `ex:a`. An unbound valid IRI retains its angle-bracket spelling.
A custom datatype can similarly appear as `Literal("needle", datatype=types:custom)`.
These labels preserve the complete reference finding; they add no validation rule.

Blank inverse-path focus nodes render their outgoing graph facts, with sorted
predicate and object labels, RDF list order and bounded recursive descriptions.
Reports see the graph after procedural profile rules. The additional class
membership flattening used by the JavaScript SHACL engine does not enter these
descriptions. For example, a procedurally assigned DataEntity does not acquire an
extra CreativeWork label solely for reporting. A separate
[diagnostic correction suite](../../tests/reference/blank-node-diagnostics/README.md)
checks RDF equality, canonical traversal and per-focus cache isolation against
an independently corrected formatter; the original Python results remain recorded.

The graph starts with RDFLib's default namespace bindings. Its root context binds
`@vocab` first, followed by terms whose alias-expanded IDs end in `#`, `/` or `:`.
Namespace IDs retain Context's raw spelling, including relative vocabulary;
absolutizing them would invent bindings absent from the reference graph.
Node, property and type scopes do not add graph-wide prefixes.

Root definitions retain source member order, including numeric-looking names.
A duplicate key keeps its first position and last value. Imported members precede
local members; overriding a member retains that position. Context resets clear
terms and vocabulary while retaining version and base state. Repeated remote
inclusions remain incomplete, including inclusions separated by a reset.

Namespace rebinding follows the reference store's prefix/namespace ownership.
Occupied prefixes acquire a numeric suffix; another alias can take ownership of
the same namespace. The required profile's ontology graph retains Graph's default
bindings. PySHACL inoculation restores prefixes absent from the data graph's
initial prefix snapshot. This can restore `xsd:string` after a context renamed
that default namespace. Custom namespace aliases retain their reference behavior.

URI splitting uses pinned Unicode name and split-start categories plus explicit
extenders. The initially derived namespace must be bound before longest-prefix
selection applies. A simple `startsWith` lookup would shorten different IRIs.
URIRef serialization errors retain the raw URI text, matching pySHACL's fallback.
The Unicode table records the RDF categories and Python's `\w` predicate
separately. All predicates use Python Unicode 15.1.0, with an
independent digest covering every Unicode codepoint.

The independent capture runs the locked RDFLib Graph/JSON-LD parser and pySHACL
stringifier, including ontology namespace inoculation. It records 30 binding
scenarios and 618 exact URI labels. Prefix receipts hash the complete ordered
binding list; complete-parser fixtures separately compare status and all findings:

```sh
artifacts/reference/python-env/bin/python scripts/reference/capture-rdf-namespaces.py --output artifacts/reports/rdf-namespaces.json
cmp tests/parity/expected/rdf-namespaces.json artifacts/reports/rdf-namespaces.json
```

The runtime boundary lives in
[metadata/rdf/namespaces](../../packages/validator/src/metadata/rdf/namespaces/context.js).
[Compatibility evidence](../compatibility/PARITY.md) retains the merged
reference, incomplete outcomes and publication blockers.

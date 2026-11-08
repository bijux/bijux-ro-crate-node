# Disabled JSON-LD terms

The pinned BIA context parser passes a disabled mapping's null identifier to
`URIRef`, raising `TypeError`. An unused `"unused": null` term is enough to
interrupt an otherwise valid crate. [JSON-LD permits null term mappings](https://www.w3.org/TR/json-ld11-api/#dfn-null).

Node keeps custom terms disabled and retains BIA field-remapping checks. Disabling
an unused prefix remains distinct from disabling a standard BIA field.

Twelve complete captures include seven original Python crashes and five agreeing
controls. Each correction must match an untouched Python counterpart's full
report. Both PyLD and RDFLib independently confirm equal RDF graphs for those
counterparts, including used disabled properties, a model error and a disabled
BIA field. `original-primitive.json` also preserves the old direct-parser failure;
the remaining ordinary metadata primitives stay unchanged.

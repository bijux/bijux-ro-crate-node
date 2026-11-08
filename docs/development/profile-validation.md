# Profile entailment and literal targets

The BIA validator materializes the locked reference's supported entailments
before selecting required profile targets. Inference stores generalized facts
whose subject is a literal separately from ordinary RDF quads. Both stores must
reach target selection and constraint evaluation: a property range can make a
literal a Dataset target even though that value cannot be an RDF node identifier.

Target membership and SHACL class conformance have different meanings. A literal
with inferred Dataset membership is checked for the Dataset constraints, but it
still fails `sh:class schema:Dataset`. The exact-version patch for
`rdf-validate-shacl@0.6.5` preserves that reference behavior. Its datatype check
also accepts a plain string for `sh:datatype xsd:string` without rewriting it as
an explicitly typed term. Rewriting would merge distinct collection and property
values before constraints run.

The generated inference assets include the reference's built-in OWL class and
annotation-property facts. They enter through the same bounded insertion API as
other entailments. Regenerate them with the locked Python environment:

```sh
artifacts/reference/python-env/bin/python scripts/reference/export-profile.py
artifacts/reference/python-env/bin/python tests/parity/generators/generate-profile-inference.py
```

Hosted reference qualification rejects changes to those generated outputs.
Full-crate captures independently check the public parser reports. Browser
continuation tests additionally require invalid or incomplete outcomes to refuse
handoff and valid outcomes to preserve the selected bytes and contexts. These
finite controls do not establish support for arbitrary OWL rules.

Inferred RDF collections may also have literal nodes. Cycle detection compares
complete RDF terms, including datatype and language. For example, a plain
`"head"` followed by `"head"^^xsd:string` is a two-node list. Treating their text
as one node can omit a later member and skip a required Dataset constraint.
Independent OWL and complete-crate controls cover that case, differing language
tags and a different-text control.

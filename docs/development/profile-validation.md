# Profile entailment and literal targets

The BIA validator materializes the locked reference's supported entailments
before selecting required profile targets. Inference stores generalized facts
whose subject is a literal separately from ordinary RDF quads. Both stores must
reach target selection and constraint evaluation: a property range can make a
literal a Dataset target even though that value cannot be an RDF node identifier.

Blank-predicate intermediates also remain private during closure. Inverse
properties and property chains may consume them to derive ordinary memberships;
the pinned engine removes the blank-predicate facts after closure. Those
memberships survive cleanup and still select required profile constraints.
Private insertions and chain traversal use the shared quad and path budgets. Rule
dispatch compares RDF term types as well as text, so a blank-node label cannot
impersonate a vocabulary predicate.

Datatype initialization follows the pinned engine's one-time implicit-literal
and explicit-resource maps, including its initial `owl:sameAs` processing.
Resource terms may enter those sets and receive `rdfs:Datatype` membership;
typing every explicit datatype instance that way would produce extra facts.
Forward/reverse equality, absent equality and literal controls retain the
reference's decisions.

Self-equivalent classes and properties do not acquire reflexive schema edges
from equivalence alone. Independently declared OWL class/property types still
contribute their normal reflexive axioms. Complete-crate controls exercise both
missing-name findings and valid outcomes selected through these entailments.

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

Subclass/subproperty transitivity preserves the pinned endpoint guards: a cycle
does not itself add a reflexive schema edge. Explicit self-subclass facts retain
their class equivalence behavior; an untyped self-subproperty does not create
self-equivalence. Declared OWL classes and recognized property types still gain
their separate reflexive axioms. Whole-crate controls verify both missing-name
rejections and their valid counterparts.

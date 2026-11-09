# Inferred collection contracts

OWL rules require the complete [LIST antecedent](https://www.w3.org/TR/owl2-profiles/#Reasoning_in_OWL_2_RL_and_RDF_Graphs_using_Rules).
A partial prefix supplies no list operand. Complete literal cells retain their
RDF identity regardless of Python truth value. Every member-position pair is
checked, including the final pair and repeated terms in `AllDifferent`.

The 125 complete crates contain 36 explicit corrected-reference differences,
86 deeply unchanged controls and three bounded input limitations. They cover
partial and terminated heads/tails, member pairs and nil descriptions. Original
and corrected captures are retained separately with exact input-byte receipts.

Inference returns incomplete when an actually consumed collection has multiple
complete branches, including additional lengths through described `rdf:nil`.
Dead branches and nonproductive nil descriptions do not trigger that limit.
`limits.json` declares the three full-crate examples; generalized literal cells,
normal empty nil and finite path/quad budgets remain supported.

`capture.py` leaves the installed Python source untouched. Its corrected mode
accepts only the exact registered inputs, verifies original function hashes,
and excludes the declared limits. `prove-lists.py` and `prove-pairs.py` check
independent ground rule antecedents against the pinned dependencies.

`ordinary-reference.json` preserves fourteen historical ordinary
records, including exceptions and input hashes. Fresh original captures are
separate. Only the proven two-child order variations for
`datatype-sameas-derived` and `datatype-sameas-explicit-datatype-control` are compared as permutations during capture
verification; every child and all other fields remain exact. This does not
change ordinary or live result comparison. The original upstream-defect suite
is unchanged.

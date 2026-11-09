# Reserved type identifiers

[IRI expansion](https://www.w3.org/TR/json-ld11-api/#iri-expansion) ignores
reserved, unrecognized keyword-shaped values such as `@future`. Node types that
expand to null must be omitted before node-map construction. Existing types,
ordinary edges and nonreserved identifiers such as `@future1` remain intact.

Thirteen registered graph cases retain unchanged PyLD 2.0.4 expansion, its
null-type constructor exception, and independently expanded omission
counterparts. The capture checks that removing only null expanded types yields
exactly the counterpart expansion; all graph triples come from the unchanged
counterpart processor. No reference installation is modified. The eight complete
crate controls in [reserved-types.json](../../parity/inputs/reserved-types.json)
retain unchanged Python reports in the ordinary agreement corpus.

Six [complete observers](observers/inputs.json) exercise visible profile findings.
Two have an explicitly corrected upstream difference; four retain the entire
unchanged reference record. Only the two registered metadata hashes may replace
a reserved type-map key with `@none` or omit the explicit reserved type. At both
the metadata reference graph and profile data-graph roles, unchanged PyLD proves
null-type omission equivalent to that counterpart. Unchanged RDFLib constructs
the counterpart graph, preserving its literal constructors; the two processors'
RDF 1.1 graphs must agree. Original metadata, model parsing and profile validation
remain untouched. Hash-bound source, request, restoration and complete-report
checks run separately from ordinary agreement. Unknown inputs cannot acquire
this correction.

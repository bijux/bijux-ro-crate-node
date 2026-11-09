# JSON-LD container expansion

Graph containers retain their expanded contents before wrapping them in `@graph`,
including an identifier-only object. Dropping that object too early loses the
link from its parent. The standard expansion algorithm only drops free-floating
objects at the document or `@graph` boundary.

Type-map keys use vocabulary expansion in standard metadata processing. In RDF
processing, they have the same identifier role as an explicit `@type`, including
base resolution and the selected-input parent boundary. An index that expands
to null contributes no type and must not insert null into the node map.

The capture script records 36 graph and 44 type-map expansions using unchanged
PyLD 2.0.4. Type cases also record RDF type identifiers from unchanged RDFLib
7.6.0. Tests retain complete expansions, parsed/serialized loader controls,
concurrent cache isolation, caller immutability and null-index neighbors.
Twenty-eight complete crates retain independent Python statuses and full reports
in the ordinary agreement corpus: eight valid and twenty invalid.

These checks follow the [JSON-LD 1.1 expansion algorithm](https://www.w3.org/TR/json-ld11-api/#expansion-algorithm).
They do not equate named-graph processing in RDFLib with standard expansion.

# Language-map ownership

Language-map keys select language tags; they are not node properties, even when
a context maps a key to `@id` or `@type`. Scalar and array text values retain the
same literal identity without applying a label's term coercion or local context.

Twelve named graph controls agree with unchanged PyLD 2.0.4 and RDFLib 7.6.0.
Four additional malformed-value/context controls retain standard expansion
errors. The complete crate observers in
[language-map-ownership.json](../../parity/inputs/language-map-ownership.json)
retain unchanged Python reports, including the inferred WebSite name finding.
Original documents remain unmodified during RDF preparation.

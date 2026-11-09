# JSON-LD processing contracts

This family registers 80 exact complete inputs and their context resources.
Seventy-two intentionally differ from the pinned parser; eight retain its full
public outcome while exposing a primitive difference. The expected outcomes are
four valid, 37 invalid and 39 incomplete. Every incomplete result must retain its
specific processing reason. Generic exceptions cannot satisfy these contracts.

The 72 context/container inputs use an isolated, source-hashed correction of the
metadata parser's reference graph constructor. Unchanged PyLD performs expansion
and RDF conversion; only its default graph enters the original reference checks.
A literal datatype must be one IRI after type-map insertion. RFC 5646 ABNF
well-formedness, including grandfathered and private-use tags, determines which
language literals enter RDF. Registry validity is separate: duplicate variant or
extension subtags remain syntactically well-formed. These invariants correct accidental constructor
exceptions and follow the [JSON-LD expansion and Object-to-RDF algorithms](https://www.w3.org/TR/json-ld11-api/).
The remaining metadata, model and profile pipeline is unchanged. Original
captures and exact corrected captures retain all findings and completion states.

Eight remote local-context inputs have separate unchanged-Python counterparts.
Only the remote resource's `@propagate` flag is removed; metadata and selected-file
bytes stay identical. These local nodes have no descendants affected by the flag.
Unchanged PyLD with semantic context inlining and unchanged RDFLib on the
counterpart produce isomorphic graphs. Whole-parser counterpart reports provide
four valid and four invalid outcomes. Inlining is used only for the graph proof;
it is not substituted into the whole crate, where it would alter flattening checks.

Seventy-two direct primitive records also cover the eight masked full outcomes.
The direct projection retains only default-graph triples and distinguishes the
validator's untyped strings. Exact input scopes exclude explicit xsd:string from
that projection. Exception capture portability replaces only the pinned PyLD
module's installation filename; reports and other exception fields remain exact.
This family does not broaden the existing upstream-defect registry or ordinary
parity comparator.

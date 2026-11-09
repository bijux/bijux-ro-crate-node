# Reference literal identity

RDF conversion normalizes recognized literal values before collection checks and
profile inference. These operations must see the same term identity. Converting
only at the collection check can still miss an OWL value restriction and skip
required validation.

XMLLiteral conversion follows the locked RDFLib/Python fragment parser and
minidom serialization. For example, `<p a="1"></p>` becomes `<p a="1"/>`.
Attribute order and CDATA boundaries remain significant; this is the reference's
serialization behavior rather than general XML canonicalization. Parsing and
serialization use a bundled XML implementation in Node and browsers.
XML 1.0 normalizes CR and CRLF to LF, while NEL, line separator and paragraph
separator remain distinct characters. Namespace values containing an ASCII space
fail the pinned Expat parser and retain their original spelling. Character
references for tab, LF and CR in those values remain accepted.
Reserved namespace bindings also retain the original spelling: only `xml` may
name the XML namespace, and neither the `xmlns` prefix nor the XMLNS namespace
can be bound. A nonempty prefix cannot be undeclared. Ordinary prefix shadowing,
default namespace resets and proper `xml` bindings still normalize.
Source syntax and namespace-expanded attribute names are checked before DOM
construction can escape malformed text or replace duplicate attributes.
Valid unprefixed `xmlns` elements and literal U+FFFD attribute values normalize;
bare references, invalid empty-element syntax and forbidden names retain their
lexical spelling. Name checks use XML 1.0 Fifth Edition; the pinned Expat parser
supports Fourth Edition names, so newer permitted names remain a documented
reference boundary.

HTML conversion follows html5rdf's strict fragment parsing and serialization
settings. `<P>abc</P>` becomes `<p>abc`. Attribute quotes, minimized boolean
attributes and optional tags follow the pinned serializer. Failed conversion
preserves the original text: `<BR></BR>` differs from `<br><br>`, and a caption
outside a table differs from its text content. Scripting is disabled while
parsing, so `<noscript>a &amp; b</noscript>` and `<noscript>a & b</noscript>`
normalize to the same value.

The strict parser adapter distinguishes legal implied endings and fostered table
text from silent tree repairs. Missing table rows, discarded or substituted tags,
misnested formatting, and fostered table elements retain the original spelling.
Template contents use the reference's ordinary-element rules. The bundled parser
operates on an internal tree; it does not render markup or fetch resources.
The obsolete `isindex` element fails in HTML processing mode. An HTML start tag
that would break out of SVG or MathML also fails before tree recovery. HTML
integration points, such as SVG `foreignObject` and MathML text elements, retain
their ordinary processing. These decisions use parsed tokens and namespaces.
Nested headings and `nobr` formatting also preserve lexical identity when the
body handler would repair them. The checks follow actual heading removal and
formatting reconstruction, including paragraph closure and foreign integration
points, while retaining legal neighboring structures.

[Foreign-content cases](../../tests/parity/inputs/html-foreign-content.json) and
[reserved-namespace cases](../../tests/parity/inputs/xml-reserved-namespaces.json)
retain independently captured complete reports for collections, OWL restrictions
and agreeing controls.

The exact parser versions are locked. HTML serialization constants are generated
from the locked Python installation. Capture expectations independently:

```sh
artifacts/reference/python-env/bin/python scripts/reference/capture-markup-identities.py --output artifacts/reports/markup-identities.json
cmp tests/parity/expected/markup-identities.json artifacts/reports/markup-identities.json
```

Use `--write-runtime-data` only when intentionally regenerating those constants
against a qualified reference. Hosted checks reject stale constants or differing
captured identities. Full-crate fixtures separately exercise collection equality,
OWL restrictions and distinct-value controls. Source and installed browser
continuation checks must refuse every invalid outcome.

Dependency notices and the CPython/html5rdf adaptation licenses ship with the
validator. The finite regression corpus does not prove correspondence for every
possible literal or RDF expression; known gaps remain release blockers in
[the compatibility record](../compatibility/PARITY.md).

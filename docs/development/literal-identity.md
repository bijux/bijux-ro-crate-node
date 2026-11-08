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

HTML conversion follows html5rdf's strict fragment parsing and serialization
settings. `<P>abc</P>` becomes `<p>abc`. Attribute quotes, minimized boolean
attributes and optional tags follow the pinned serializer. Failed conversion
preserves the original text: `<p/>abc` remains unchanged. The bundled parser
operates on an internal tree; it does not render markup or fetch resources.

The exact parser versions are locked. HTML serialization constants are generated
from the locked Python installation. Capture expectations independently:

```sh
artifacts/reference/python-env/bin/python scripts/reference/capture-markup-identities.py
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

# Temporal literal contracts

RDFLib 7.6.0 delegates XSD time and dateTime conversion to Python's broader
`fromisoformat` parser. It normalizes a trailing NUL and accepts a compact time
spelling outside the [XSD lexical grammar](https://www.w3.org/TR/xmlschema11-2/#time).
Those conversions can collapse distinct RDF terms or suppress datatype findings.

Nine exact crates retain the untouched Python results. Six completed rejections
use independently corrected Python results; three complete controls stay exact.
The correction rejects only the three registered datatype/spelling pairs, before
normalization. The separately source-bound metadata cardinality guard is composed
for these exact registered inputs and recorded in `collection_qualification`.
Every other converter and parser stage stays intact.
Changed entries in both RDFLib converter maps are restored even when capture fails. Source hashes,
complete input guards and negative tests confine this exception.

`capture.py` produces untouched results; `--corrected` requires the complete
`inputs.json` request. `verify-capture.mjs` compares fresh captures with both saved
records. The ordinary parity comparator has no temporal exception.

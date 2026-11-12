# XML name edition contract

The pinned Expat parser documents support for XML 1.0 Fourth Edition. Node's
XML literal adapter uses the Fifth Edition name productions. This is a declared
edition boundary, not a claim that Expat implements its supported edition
incorrectly. [Expat support](https://libexpat.github.io/doc/common-pitfalls/#xml-11-and-xml-10-fifth-edition-are-not-supported),
[XML name productions](https://www.w3.org/TR/REC-xml/#NT-NameStartChar).

Fifth Edition allows the tested U+037D/U+037F Greek names, U+200C/U+200D joiners,
U+203F continuation, U+3001, supplementary U+10000 through U+EFFFF, and U+FFFD.
U+037E and characters above U+EFFFF remain forbidden in names. Element and
attribute names follow namespace-qualified name syntax; processing instruction
targets are unprefixed names. [Namespace names](https://www.w3.org/TR/xml-names/#ns-qualnames).

The finite suite contains 24 original inputs and 22 ASCII-name counterparts.
It covers U+EFFFF/U+FFFD name boundaries and U+037D element, attribute and
processing-instruction names, alongside the listed name-start/continuation cases.
Collections and OWL hasValue restrictions exercise the resulting literal
equality. The two agreeing ASCII controls and every counterpart retain exact
Python comparison. There are 11 intentional completion differences and
23 invalid outcomes among all 46 cases.

`python.json` records every original and counterpart from the unchanged oracle,
including exceptions and input byte hashes. `contract.json` explicitly maps each
qualified input to its counterpart. Only the two XML literal name tokens change:
the same permitted name character is replaced consistently with an ASCII name.
The source-token witness accepts only the empty element, fixed attribute-value
and empty processing-instruction forms used here. It rejects substitutions in
character data, attribute values or processing-instruction data.
Other metadata values, contexts and manifest bytes must remain identical. This
is an equality witness for these bounded fixtures, not a general equivalence
claim for differently named XML documents.

On current main the eleven collection candidates also agree with their exact
Python reports; their counterpart witnesses remain as grammar evidence.

Node's entire result is compared with the unchanged Python counterpart using
the ordinary strict comparator. Status, severity, message, location, duplicate
findings and empty buckets all remain significant. No report text is rewritten.
Unknown input bytes, contexts, names, extra findings and altered diagnostics are
rejected. Unregistered mismatches receive no exception.

Recapture and verify originals and counterparts independently:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONHASHSEED=0 artifacts/reference/python-env/bin/python tests/parity/oracle.py < tests/reference/xml-name-edition/inputs.json > artifacts/reports/xml-name-edition.json
node tests/reference/xml-name-edition/verify-capture.mjs artifacts/reports/xml-name-edition.json
node tests/reference/xml-name-edition/run.mjs
```

This suite stays outside the ordinary green Python-agreement corpus. It does
not change the reference pin or authorize a claim of universal XML parser
correspondence. Publication remains disabled.

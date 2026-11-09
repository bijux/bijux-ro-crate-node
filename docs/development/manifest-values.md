# Manifest value interpretation

Manifest schema properties can share a physical TSV column. The reference checks
path uniqueness before expanding list-valued columns, then builds reference joins
from the expanded table. A shared path or name column can therefore become a
list, which cannot be a Python dictionary key. Validation remains incomplete in
that case; a successful lookup against an earlier scalar snapshot would approve
a crate the reference cannot finish checking. Distinct scalar columns retain
their ordinary behavior.

A source-image reference also checks the target row's `rdf:type`. List expansion
can replace that value. For a singleton list, pandas' missingness check can be
used as a boolean and RDFLib converts the entire list to its string representation.
For example, `['http://bia/Image']` still differs from `http://bia/Image`; the
validator reports the wrong type rather than unwrapping the member. Larger or
empty lists interrupt the check when their missingness result cannot become a
single boolean. Empty reference lists perform no target check.

Self-reference findings belong to the completed self-reference scan. If a later
conversion interrupts that scan, its pending findings are discarded. Findings
already produced by uniqueness or metadata-reference checks remain in the
incomplete result. Complete-parser controls cover both ownership boundaries.

The floating-point converter applies a negative sign before exponent scaling.
Its computed exponent includes fractional digits as well as the explicit `e`
token. Extreme scaling produces positive zero below -616, and a zero mantissa
with an exponent above 308 also becomes positive zero. Ordinary divisions can
retain negative zero. These signs matter in diagnostic row labels even when
both validators reject the same crate.

[format.js](../../packages/validator/src/manifest/format.js) owns manifest scalar
and expanded-string-list display. Its Unicode printability ranges come from the
pinned Python interpreter rather than the JavaScript engine. The independent
capture checks the runtime ranges and hashes Python's string representation of
every Unicode codepoint, including unassigned characters and lone surrogates:

```sh
artifacts/reference/python-env/bin/python scripts/reference/capture-manifest-formatting.py --output artifacts/reports/manifest-formatting.json
cmp tests/parity/expected/manifest-formatting.json artifacts/reports/manifest-formatting.json
```

Full-parser captures retain the original file bytes, completion and findings.
They remain finite checks against the provisional reference; the accepted-reference and selected-root limits in [the compatibility record](../compatibility/PARITY.md)
still apply.

Numeric inference privately retains the two independently qualified pandas C
accumulation profiles. File-list validation reuses its rules against both only
when a retained value differs. Interpretation-dependent findings, exceptions or
inbound references interrupt validation before those findings are committed.
[Numeric identity](../compatibility/manifest-numeric-identity.md) describes the
portable input boundary and its separate required qualification.

# OWL key equality contracts

`prp-key` requires both class instances to share a value for every property in a
complete key list. The pinned owlrl implementation omits the last property when
checking the second instance. For a one-property key, it can infer identity even
when that instance has no key value. The inferred identity can copy a name onto
an unnamed WebSite and erase its required-name finding.

The [W3C rule](https://www.w3.org/TR/owl2-profiles/#Reasoning_in_OWL_2_RL_and_RDF_Graphs_using_Rules)
requires the same value at every property position. `rules.py` verifies the exact
original function hash and changes only the omitted loop bound in memory.
Original installed source files remain untouched, and the original method is
restored even if capture fails.

Six complete inputs reproduce false approvals; ten controls retain identical
original and corrected Python records. Controls cover absent, disjoint and
shared values, multiple values, named counterparts and property order. Node
compares the full corrected report and exact input bytes. The required-name
message, severity, focus and all unrelated findings remain strict.

`primitive.json` retains the existing original query whose answer is `true` and
an independently captured corrected answer of `false`. The original primitive
fixture and generator remain unchanged. The ordinary parity corpus excludes
these explicitly characterized disagreements.

Capture and verification:

```sh
$BIA_PYTHON tests/reference/key-equality/capture.py < tests/reference/key-equality/inputs.json > artifacts/key-original.json
$BIA_PYTHON tests/reference/key-equality/capture.py --corrected < tests/reference/key-equality/inputs.json > artifacts/key-corrected.json
node tests/reference/key-equality/verify-capture.mjs original artifacts/key-original.json
node tests/reference/key-equality/verify-capture.mjs corrected artifacts/key-corrected.json
$BIA_PYTHON tests/reference/key-equality/capture-primitive.py > artifacts/key-primitive.json
cmp tests/reference/key-equality/primitive.json artifacts/key-primitive.json
```

Use the pinned Python environment with `PYTHONDONTWRITEBYTECODE=1`,
`PYTHONHASHSEED=0` and an artifacts-owned `TMPDIR` for these commands.

# Manifest inference contracts

Nine complete inputs qualify two pandas 3.0.2 inference defects. Original Python
reports remain recorded: two duplicate-path rejections, one interruption and six
valid controls. Independently corrected Python completes all nine as valid. This
family stays outside ordinary parity and changes no product runtime behavior.

## Signed minimum and missingness

The [pinned C parser](https://github.com/pandas-dev/pandas/blob/v3.0.2/pandas/_libs/parsers.pyx)
uses the minimum signed integer as its missing sentinel. When missing values
require a float promotion, its value-based mask also removes a genuine parsed
minimum. The minimum's decimal spelling is not an NA spelling. Two inputs then
receive a duplicate-path error because both their distinct cells become missing.

Only those two exact TSV hashes use the Python parser with an explicit nullable
`Int64` column, followed by pandas' own `float64` promotion. This retains the
original inferred dtype and restores exactly one genuine minimum cell per input.
Every other value, column, index and missing mask is compared unchanged; an
independent C-parser nullable counterpart produces the same complete frame.

Bare `engine='python'` is insufficient: a checked ARM run rounds the inferred
float one ULP below the exact minimum. That observation is retained separately;
it is not corrected-reference authority. The nullable integer promotion must
produce the exact power-of-two value on every qualification platform. Existing
platform-dependent float-input limits remain unchanged.

## Implicit indexes and warning labels

The [pinned chunk merger](https://github.com/pandas-dev/pandas/blob/v3.0.2/pandas/io/parsers/c_parser_wrapper.py)
can use physical column 2046 to index a two-name header while formatting a
`DtypeWarning`. The values are already computed; the warning label lookup raises
`IndexError` before the complete frame can be returned.

Only the exact mixed-chunk TSV hash uses an in-memory source correction, verified
against the original function and installed-file hashes. It falls back to the
physical column number when no header name exists. The warning is still emitted.
No computation or concatenation expression changes. The proof checks all 2047
columns computed before the original failure, then all 2048 complete physical
columns against an independent full-header C-parser control, including all index
levels and numeric/string kinds. The numeric implicit-index control stays exact.

## Capture and qualification

`capture.py` accepts only the complete exact nine-case request. It verifies the
installed pandas files against wheel RECORD hashes, restores both original call
boundaries and checks installed-file integrity afterward. Machine-specific wheel
hashes and bare-engine rounding observations belong to separate integrity/detail
receipts. Corrected reports come exclusively from the pinned Python parser and
pandas operations; no Node output supplies expectations.

```sh
$BIA_PYTHON tests/reference/manifest-inference/capture.py --integrity-output artifacts/manifest-original-integrity.json < tests/reference/manifest-inference/inputs.json > artifacts/manifest-original.json
$BIA_PYTHON tests/reference/manifest-inference/capture.py --corrected --integrity-output artifacts/manifest-corrected-integrity.json < tests/reference/manifest-inference/inputs.json > artifacts/manifest-corrected.json
node tests/reference/manifest-inference/verify-capture.mjs original artifacts/manifest-original.json
node tests/reference/manifest-inference/verify-capture.mjs corrected artifacts/manifest-corrected.json
$BIA_PYTHON tests/reference/manifest-inference/prove-mechanisms.py --workdir artifacts/manifest-proof-inputs --details-output artifacts/manifest-proof-details.json > artifacts/manifest-proof.json
cmp tests/reference/manifest-inference/mechanisms.json artifacts/manifest-proof.json
$BIA_PYTHON tests/reference/manifest-inference/test_capture_scope.py
```

Use the pinned environment with `PYTHONDONTWRITEBYTECODE=1`, `PYTHONHASHSEED=0`
and an artifacts-owned `TMPDIR`. Expected reports and input registrations remain
private; exported maps, sets and cases cannot change comparison authority.

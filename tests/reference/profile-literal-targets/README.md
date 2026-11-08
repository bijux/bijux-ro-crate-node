# Literal Dataset target qualification

These fixtures preserve required-profile rejection where the pinned Python
reference fails open. They are separate from the passing differential corpus.

| Inputs | Python | Node |
| --- | --- | --- |
| Six typed literals inferred to be Dataset instances by a property's range | valid | invalid |
| String and unparseable-integer Dataset controls | invalid | invalid |
| The same six typed values without that Dataset range | valid | valid |

Node must report the literal's required inverse `schema:hasPart` finding.
The Session must refuse continuation for all eight Dataset controls and return
the exact selected bytes for the six valid counterparts. Source and installed
qualification bind the selected Session, worker and core modules explicitly.

`python.json` records the unmodified locked parser's complete reports and input
byte hashes. The strict comparator still detects the six disagreements. This
suite checks Node's approved correction without claiming identical Python behavior.
Each corrected report must contain the exact required finding and preflight INFO;
extra or reclassified findings fail too.
Its inputs are outside `tests/parity/inputs/` and do not increase the passing
corpus or its continuation counts.

```sh
node scripts/reference/capture-profile-literal-targets.mjs --output artifacts/reports/profile-literal-reference.json
cmp tests/reference/profile-literal-targets/python.json artifacts/reports/profile-literal-reference.json
node tests/reference/profile-literal-targets/run.mjs
node tests/browser/upstream-defects.mjs
```

Package qualification runs the same policy against installed Node consumers
and actual installed Sessions/workers in Chromium, Firefox and WebKit.

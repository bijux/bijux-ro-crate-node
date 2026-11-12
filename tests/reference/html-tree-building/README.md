# Bounded HTML tree-building contracts

These sixteen complete crates qualify eight literal pairs. Seven outcomes intentionally differ from raw merged main; nine inputs retain their exact original reports. Corrected validation produces eight valid and eight invalid results. This family remains outside the ordinary agreement corpus and the existing upstream-defect family.

The rules under test are narrow. Ruby text starts can imply an `rb` ending. `search` and `dialog` starts close a paragraph; a `search` end can imply a `dt` ending. A trailing unmatched `p` end is a parse error. These decisions follow the [HTML body tree-building rules](https://html.spec.whatwg.org/multipage/parsing.html#parsing-main-inbody). The adapter's existing strict policy preserves a malformed fragment's lexical spelling.

`original-python.json` retains the unchanged pinned parser's portable complete reports. `corrected-python.json` is a separately labelled reference model: `corrected.py` replaces only the relevant body-dispatch entries and ruby implied-end handling **in memory**, then restores every original object in `finally`. Source files and installed wheel bytes remain untouched. The same source-bound metadata cardinality guard is composed for these exact
registered inputs and recorded as a separate collection qualification. The
pinned serializer is unchanged. This is not a claim of universal current HTML parser or serializer parity.

The corrected capture records hashes of the original dependency modules/functions, correction implementation, unchanged oracle, capture wrapper and exact input file. Its wrapper accepts only these explicit sixteen inputs. Existing normalization is reused; no findings, locations or counts are discarded. Fixture-role checks ensure the DOM proofs describe exactly the literals used by both collection and `hasValue` routes. Apart from those two literal values, each route retains one fixed crate structure.

`trees.json` separately records original/corrected DOMs, lexical identities and strict parse-error traces. The two dangling-paragraph fragments fail strict conversion; their valid counterparts remain distinct. The other six pairs have equal corrected trees. `dom-proof.mjs` checks every node, namespace, attribute and text value against actual Chromium, Firefox and WebKit trees. Browser serialization is not substituted for the retained RDF serializer.

Capture and verify the evidence:

```sh
artifacts/reference/python-env/bin/python tests/reference/html-tree-building/capture.py \
  < tests/reference/html-tree-building/inputs.json > artifacts/reports/html-original.json
node tests/reference/html-tree-building/verify-capture.mjs artifacts/reports/html-original.json
artifacts/reference/python-env/bin/python tests/reference/html-tree-building/capture.py --corrected \
  < tests/reference/html-tree-building/inputs.json > artifacts/reports/html-corrected.json
node tests/reference/html-tree-building/verify-capture.mjs artifacts/reports/html-corrected.json --corrected
artifacts/reference/python-env/bin/python tests/reference/html-tree-building/capture-trees.py \
  --output artifacts/reports/html-trees.json
node tests/reference/html-tree-building/verify-capture.mjs artifacts/reports/html-trees.json --trees
artifacts/reference/python-env/bin/python tests/reference/html-tree-building/test_correction.py
node tests/reference/html-tree-building/dom-proof.mjs
node tests/reference/html-tree-building/run.mjs
```

The runner accepts `BIJUX_VALIDATOR_MODULE` for an explicitly installed validator. The family exports `cases`, `assertResult`, `originalByName`, `rejected`, `approvedDifferences` and `reference` for required aggregate qualification. All results are compared with the complete corrected reference reports; unregistered inputs, wrong completion states and additional findings fail.

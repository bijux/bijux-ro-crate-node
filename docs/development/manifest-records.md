# Manifest record buffering

The TSV reader follows pandas 3.0.2's default file-reading and tokenizer state.
Record boundaries depend on bounded reads as well as tabs, quotes and line
endings.

The reference prefetches two records: the header and the first data row. It then
chooses a low-memory row budget from the table width, including any implicit
index columns. The budget starts at one and doubles while twice that value is
less than `floor(2**20 / width)`. Two- and three-column inputs use 262,144 rows;
four-column inputs use 131,072.

With the reference's default `encoding=None`, its TextIO reader requests
262,144 Unicode characters and encodes each buffer as UTF-8. Astral characters
count once. A file BOM counts toward the first request before the tokenizer
skips its bytes; BOMs inside fields remain data.

The whitespace-line state backtracks to a prior LF or the current tokenizer
call's input position. After skipped CR records, that boundary can replay a CR
as an empty record until the row budget is reached. For this escaped TSV input:

```text
file_path\tdataset\nx\t\r\r other\n
```

The pinned parser produces 262,145 data rows, including repeated empty paths.
Both complete validators reject the duplicate paths. The JavaScript tokenizer
derives the replay from its lexical state and read boundaries.

Width checks also use buffered line metadata after a low-memory drain. A row
with an extra field is accepted at one boundary while equivalent rows just
before or after it are rejected. The generated complete-crate controls retain
that reference behavior with unique paths, ordinary and implicit indexes,
and two- and four-column schemas.

[records.js](../../packages/validator/src/manifest/records.js) owns lexical states,
read budgets, Unicode buffers, BOM and NUL handling.
[tsv.js](../../packages/validator/src/manifest/tsv.js) owns header allocation, implicit-index projection and column
inference. This boundary keeps read-state rules separate from value conversion.

The independent capture reads actual files through the locked pandas
installation and hashes every returned row. Compact data-only inputs reconstruct
large boundary cases without storing expanded expected tables:

```sh
artifacts/reference/python-env/bin/python scripts/reference/capture-tokenizer-records.py --output artifacts/reports/tokenizer-records.json
cmp tests/parity/expected/tokenizer-records.json artifacts/reports/tokenizer-records.json
```

The 212 captures record exact input bytes, column names, row counts and complete
row hashes or exact tokenizer errors. The original 93 record controls remain
unchanged. Complete-parser captures separately verify status, diagnostics and
browser continuation. These are finite-corpus checks against the provisional
Python reference; accepted-reference and publication qualification remain
separate gates in [the compatibility record](../compatibility/PARITY.md).

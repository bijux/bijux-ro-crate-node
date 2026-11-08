# Physical parent directory characterizations

These complete crates exercise used RDF identities whose resolution depends on
a physical ancestor outside the selected crate. The Python oracle resolves them
against its filesystem path. Selected browser files do not provide that path;
Node deliberately returns `incomplete` and disables continuation.

`expected.json` records the pinned Python source, exact input byte hashes,
request digest, completion status and error count. Full oracle reports contain
machine-specific ancestor addresses and remain local capture artifacts.
These cases do not enter the passing Python-agreement corpus. Ordinary controls
with complete independent reports live in
`tests/parity/inputs/rdf-physical-base-controls.json`.

Validator unit tests and `tests/browser/root-identity.mjs` enforce the explicit
Node result separately from Python parity. The browser guard checks direct
validation, module workers and secure-origin Session continuation against source
and installed package paths.

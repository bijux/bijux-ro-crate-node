# Root context propagation corrections

RDFLib 7.6.0 can replace a nonpropagating root context with its nonexistent parent,
then call `get_id`. A root type scope can reach the same missing parent through
`_subcontext`. These are parser defects, not required RO-Crate rejections.
Node retains the root's own context and uses the processor's previous context
for descendant reversion. It keeps RDFLib literal/scoping compatibility and the
physical-parent guard.
Root-origin receipts are private to each expansion attempt. They preserve root
subject references without weakening type-scope reversion. Discarded root terms
cannot select child type scopes or leak into property coercions; metadata/model
processing keeps its standard context behavior.

Fifteen complete cases preserve four original interrupted captures and eleven
controls. Nine approved differences compare exactly with independently equivalent
inputs that the untouched Python parser completes. The remaining six cases stay
exact agreeing controls. Node completes nine valid and six invalid outcomes;
the original Python capture contains three valid, three invalid and nine
incomplete outcomes.

The single-context negative control loses the required Dataset meaning. Its
counterpart explicitly resets graph-child contexts and independently produces
the same RDF graph and required descriptor/root findings. Expanded property keys
still reject for compact-format requirements. A missing root name still rejects.
A propagation flag is never replaced wholesale with `true`.

`contract.json` lists every approved counterpart. The checker verifies identical
metadata values and other file bytes, allowing only the documented root contexts
and explicit child resets. Independently captured graph equivalence binds each
counterpart, and complete reports retain exact status, severity, location, message
and finding-count comparisons. Copying an upstream crash cannot pass.

Nineteen graph controls additionally cover native integer/boolean constructor
receipts, JSON payloads, type/property/local scopes, safe relative bases and an
unused ancestor base. The physical-parent tests separately retain refusal for
actually consumed ancestor-dependent identities. A type scope with an ordinary
propagating document context remains an unchanged reference control.

The legacy serialized remote primitive retains its exact input and original
RDFLib error in `original-primitive.json`. PyLD 2.0.4 also fails when reading the
propagation flag from that direct remote context. For this one standards graph
proof, the capture openly inlines the exact loaded context and records
`standard_context_inlined: true`. It does not alter the submitted input,
resource bytes or original RDFLib outcome. Other graph controls use their
submitted context form.

The imported primitive retains its entire input and original RDF/standard record
in `original-import-primitive.json`. Its corrected RDF graph matches an
independently equivalent propagating context, while standard expansion stays
exactly equal to its original capture. Repeated and concurrent calls retain
separate RDF and metadata context caches.

The four original complete cases and two primitives moved out of ordinary parity;
their original records remain unchanged here. The relative-import false fixture
stays ordinary because it fails earlier at its independent context lookup.
Physical parent uncertainty is not classified as an upstream defect.

Run the independent captures and source contract after preparing the pinned
reference environment:

```sh
artifacts/reference/python-env/bin/python tests/parity/oracle.py \
  < tests/reference/root-context-propagation/inputs.json \
  > artifacts/reports/root-context-python.json
node tests/reference/root-context-propagation/verify-capture.mjs \
  artifacts/reports/root-context-python.json
artifacts/reference/python-env/bin/python scripts/reference/capture-root-context-propagation.py \
  --output artifacts/reports/root-context-graphs.json
cmp tests/reference/root-context-propagation/graphs.json artifacts/reports/root-context-graphs.json
node tests/reference/root-context-propagation/run.mjs
```

`checks.mjs` exports `cases`, `assertResult`, `originalByName`, `rejected` and
`approvedDifferences` for source, installed-package and browser continuation
qualification. These explicit corrections remain separate from ordinary strict
parity. No generic propagation or exception exemption is used.

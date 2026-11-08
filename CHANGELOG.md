# Changelog

## 0.1.0 — unreleased

### Compatibility corrections

- Preserve datatype and language when identifying inferred collection nodes,
  preventing skipped profile constraints when distinct nodes share their text.
- Match signed calendar-duration carry, Decimal precision/scale and scientific
  month formatting across the three supported duration datatypes.

- Retain whitespace-surrounded Infinity tokens as manifest strings and preserve
  delimiter handling after skipped CR records.

- Preserve opaque URL paths and allowed host controls, and diagnose malformed
  multi-colon ports without inventing an invalid hostname.

- Accept native file and byte inputs across realms and preserve Blob snapshot
  size/content consistency despite subclass accessor overrides.
- Preserve generalized literal targets through profile constraints without
  conflating plain and typed strings or allowing literals to satisfy `sh:class`.
- Generate built-in OWL class and annotation-property facts from the locked
  reference and verify their full-parser consequences.
- Gate source and installed browser continuation on complete Python reports,
  exact input bytes and context snapshots for focused compatibility cases.

- Preserve the current selection when a superseded worker factory reenters or
  throws during startup, and terminate only the worker owned by that request.
- Preserve context-coerced double text, signed zero and native double precision
  during RDF conversion, including distinct invalid lexical forms.
- Materialize reflexive identities used by OWL value restrictions.
- Confine preflight reference and collection checks to the default RDF graph,
  preserving required profile findings for named-graph inputs.
- Normalize RDF numeric, boolean, whitespace, date/time, binary and duration
  literal terms before inference and collection checks. Preserve integer digit
  limits, pinned Unicode ranges and unequal or unparseable controls.
- [#21](https://github.com/bijux/bijux-ro-crate-node/pull/21): Isolate imported
  context snapshots and preserve parsed/serialized remote response completion.
- [#20](https://github.com/bijux/bijux-ro-crate-node/pull/20): Await WebKit file
  permission before native uploads, with pending and refused permission controls.
- [#19](https://github.com/bijux/bijux-ro-crate-node/pull/19): Require canonical
  product checks before publication admission, keeping npm publication disabled.
- [#18](https://github.com/bijux/bijux-ro-crate-node/pull/18): Preserve own context
  keys, ordered root propagation, context resets and scalar graph completion.
- [#17](https://github.com/bijux/bijux-ro-crate-node/pull/17): Keep editor reads tied
  to the selected files, resolve declared manifest aliases and allow native
  same-path file/folder reselection to restore disk content.
- [#16](https://github.com/bijux/bijux-ro-crate-node/pull/16): Own native bytes from
  caller-defined buffer/blob subclasses and reject overflowing timer budgets.
- [#15](https://github.com/bijux/bijux-ro-crate-node/pull/15): Match ordered pandas
  numeric conversion, lexical negative zero and explicit/generated header names.
- [#14](https://github.com/bijux/bijux-ro-crate-node/pull/14): Infer recognized
  datatype memberships and supertypes without conflating plain and typed strings.
- [#13](https://github.com/bijux/bijux-ro-crate-node/pull/13): Retain float-to-integer
  bounds, timestamp/date grammar and diagnostic precedence, and URL component
  failures across supported engines.

### Pull request changes

- [#12](https://github.com/bijux/bijux-ro-crate-node/pull/12): Retain partial
  RDF collections, reject ambiguous arcs against the reviewed Python PR23
  reference, preserve exact large-integer/decimal literal identity, and retain
  attribution with independent regression coverage.

- [#11](https://github.com/bijux/bijux-ro-crate-node/pull/11): Verify installed oracle dependency content and run the complete installed corpus on both supported Node runtimes.

- [#10](https://github.com/bijux/bijux-ro-crate-node/pull/10): Confine selected-directory references, retain pinned ontology entailment, and independently verify oracle completion and input bytes.

- [#9](https://github.com/bijux/bijux-ro-crate-node/pull/9): Preserve JSON-LD
  parser completion, cooperating profile inference and Python integer, date
  and non-finite metadata coercion.

### Package capabilities

- Introduce reusable crate input/resource/report primitives in core and a BIA
  validator in a private npm workspace with separate public package exports.
- Match the independently captured finite corpus for Python main
  `cda44ee8e9340137b409614294e0bba227bce008`, including metadata models, required
  profile checks, TSV inference, typed references and crate connectivity.
- Provide immutable browser edit sessions, cancellable workers, current-revision
  continuation and a local keyboard-accessible repair example.
- Qualify actual archive consumers in Node22/24, strict TypeScript, native
  browsers and bundlers. Preserve upstream/context/dependency notices.

The candidate remains unpublished. Accepted Python merge qualification, registry
ownership/setup and registry-installed verification remain release gates.
Canonical npm publication stays disabled and requires every declared product
check before admission. Product-owned hosted checks qualify the code independently.
Python transactional editing and additional RO-Crate packages/profiles are
outside this version.

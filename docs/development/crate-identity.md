# Selected-crate RDF identity

Each validation allocates a private file-URI root and immediate parent using
native `crypto.getRandomValues`. Relative identifiers resolve within that
validation. An absolute input such as `file:///crate/` keeps its own identity;
it cannot become the selected crate merely by matching a fixed implementation
address. Explicit `@base` directives retain their normal resolution behavior.

The private root is used consistently by reference checks, collection checks,
metadata conversion and profile validation. The generated profile snapshot's
owned metadata-descriptor targets are rebound to that same root. Input terms
are never rewritten to match those trusted shape targets. Profile inference
also receives the root for stable generated error ordering.

Reports and incomplete reasons render private addresses to stable `crate:/`
identifiers, with parent addresses expressed relative to that marker. Existing
relative profile locations retain their format. Public result fields and input
bytes remain unchanged; private identities are not returned as receipts.
Private-identity rendering leaves explicit absolute input addresses unchanged,
including addresses resembling a private one. Reference-set findings are ordered
after canonical rendering so their order does not depend on entropy.

The parity comparator normalizes the Python oracle's recorded run root. It does
not replace `file:///crate/` inside Node reports. A negative comparator control
requires an explicit absolute input IRI to remain distinct from `crate:/`.
Thirty-four independent complete captures cover the collision, agreeing relative
values, explicit bases, origin/ancestor resolution under those bases, scopes,
remote/imported contexts, unused mappings, ignored named graphs, and deterministic
incomplete results.

Selected files provide no physical parent directory. A relative RDF identity
that depends on such a parent returns `incomplete` when it survives into the
default graph consumed by validation. Continuation stays disabled. Explicit
absolute bases and rooted paths resolve independently and keep their normal
behavior. Unused context definitions, literal text, dropped ID-only nodes and
identities retained only in ignored named graphs do not cause this refusal.

The RDF-only JSON-LD mode retains lexical base, vocabulary and prefix recipes
in private context sidecars. It tags dependent node identities internally and
checks their actual default-graph retention. Private tags never enter reports.
This also preserves safe relative-base cancellations without anchoring them at
the file origin. Seventeen separate reference characterizations record Python's
physical-path outcomes; they are outside the passing parity corpus. This browser
limitation remains a complete-parity and publication blocker.

Browser guards compare direct and module-worker results on secure and insecure
origins in Chromium, Firefox and WebKit. Secure-origin Session checks also compare
complete findings, continuation eligibility and original handoff bytes. They run
against both source and installed archives. The existing Session requirement for
`crypto.randomUUID` is exercised on secure origins; the validation identity uses
`getRandomValues`, which is also checked on the insecure origins. An environment
without native randomness remains incomplete and cannot approve submission.

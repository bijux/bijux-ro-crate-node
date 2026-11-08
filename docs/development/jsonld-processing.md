# JSON-LD dependency patch

The validator bundles `jsonld@9.0.0`. Valid context terms can be named
`hasOwnProperty` or `__proto__`; they must remain data rather than changing
object behavior or interrupting parsing.

The reviewed patch in `scripts/dependencies/patches/` uses intrinsic own-property
checks and preserves own keys during cloning without invoking the prototype
setter. The validator's RDF and model-context adapters also use dictionaries
without inherited properties.

The patch also preserves immutable numeric and JSON-literal wrappers through
cloning and expansion. JavaScript otherwise conflates JSON `1`, `1.0` and
`1e0`; the locked Python reader retains their integer or floating-point kind.
Metadata parsing records that kind separately while model validation continues
to receive primitive values. A runtime without JSON reviver token sources
refuses numeric metadata rather than guessing its kind.

The non-finite constant lexer also requires exact raw-token identity. A quoted
string can decode to the same internal marker through a Unicode escape; that
string remains text. Only a token inserted by the lexer becomes `NaN` or
positive/negative infinity. Missing token-source support refuses this conversion
even when the document contains no finite numeric token.

RDF conversion uses these wrappers only internally. Native numbers retain the
Python constructor's lexical spelling and context-defined datatype. Explicit
typed strings still use RDFLib-compatible lexical conversion. Collection checks
compare the resulting terms without converting native spellings again.
For `@json` values, serialization retains numeric kinds, signed zero, large
integers, non-finite constants, Unicode key ordering and string escapes.
Per-dataset datatype aliases keep an empty datatype IRI distinct from an absent
datatype without exposing an internal marker in profile diagnostics.

RDF construction preserves explicit blank-node labels. Its private identifier
issuer reserves those labels before assigning anonymous nodes and collection
cells, preventing collisions with names such as `_:b0`. Standard JSON-LD
conversion retains its default issuer. Complete profile reports compare explicit
focus labels directly; no blanket blank-node normalization is applied.
The bare `_:`, which has no node label, retains RDFLib's URIRef identity in
subject, predicate, object and graph positions. A reserved internal IRI carries
that identity through serialization without colliding with user terms.

Parsing retains source member order separately from JavaScript enumeration,
including numeric-looking context keys and duplicate-key first insertion.
Serialized remote contexts retain the same provenance. Primitive values and
numeric token identity stay unchanged; ordinary caller objects use their native
key order.

RDF expansion preserves that order when aliases map to the same predicate.
For example, a native `1` and string `"1"` coerced to `xsd:string` produce equal
RDF triples but retain different constructor values for OWL cardinality checks.
The first source occurrence owns the value. Expansion uses a private input copy
with order provenance; standard metadata/model expansion retains its sorting
and clone behavior.

RDF preparation applies a property's child context after resolving that
property's coercion. It selects the first recognized type in input order for
type-scoped contexts and preserves the reference's nonpropagation boundary.
An opt-in expansion mode in the exact-version patch prevents standard sorted
multi-type expansion from reapplying a scope that RDFLib ignored. Only RDF
dataset construction enables this mode; metadata/model parsing retains separate
PyLD-compatible processing. Independently captured controls cover both type orders,
child scopes, reserved JSON keys, empty contexts and parser completion.

RDF context processing also gives `@json` coercion priority over `@container`
and property `@index`. A coerced JSON array remains one JSON literal even when
the term declares `@container: @list`. RDFLib still constructs a Python set
from container annotations first, so dictionary and nested-array annotations
interrupt parsing. Hashable annotations do not change JSON-literal construction.

Metadata/model processing retains PyLD's independent container validation.
Scalar mappings become one-element arrays, including null, false and zero;
these values are rejected instead of disappearing as an empty container.
Format findings can complete a rule rejection before that later context check.
The RDF and metadata/model paths use separate resolver caches, each owned by
the immutable document-loader snapshot. A relaxed RDF mapping must never be
reused as a validated metadata/model mapping. Regressions cover both processing
orders and cold/concurrent cache use with inline, remote, imported and scoped
contexts.

RDF context mappings may contain explicit relative IRIs. For example,
`{"relative": "#/"}` retains `#/` as a predicate or literal datatype, while
`relative:item` used as a node reference resolves against the active document
base. Type and vocabulary references use that same node-ID boundary. An empty
literal datatype remains distinct from an absent datatype.

With `@base: null`, RDFLib normalizes node-reference paths before retaining only
identifiers containing a colon. Thus `#/item:tail` becomes `.#/item:tail`, while
`#/item` is omitted. Prefix and coercion resolution retain the reference's
normalization boundaries. These rules do not normalize predicates, literal
datatypes or raw namespace bindings. The node-ID path and OWL datatype checks
share URI authority validation, including malformed brackets and NFKC delimiters.
A private RDF callback supplies that check to the bundled JSON-LD implementation.

The RDF-only option uses its isolated resolver cache; standard metadata/model
processing still rejects an invalid relative mapping if execution reaches that
later stage. Earlier profile findings must remain visible rather than becoming
an unrelated incomplete result. The relative-context and scoped-reference captures check 151 RDF
mapping and interrupted-parsing controls and 53 complete-parser outcomes,
including native numeric/boolean constructors, explicit typed values, null bases,
aliases, reverse mappings, imports and scoped contexts. Cache controls also run
both processing orders and concurrent RDF/standard expansion.

Five independently captured Graph controls use consumed node identities outside
the selected crate. They explicitly assert the approved physical-parent refusal
while retaining their original Python triples; they do not count as completed
RDF agreement. Literal datatypes, unused mappings, dropped nodes and ignored named
graphs retain their ordinary behavior.

Separate empty/null mapping captures keep the lexical term during RDF node-base
resolution when the processed term mapping is empty. An empty mapping for `r`
therefore resolves to the selected root's `r`, while a processed `urn:vocab:`
mapping retains that absolute identity. Literal datatype mappings keep their
empty-versus-absent distinction. Standard metadata expansion remains separate.

An explicit null base also remains disabled after later relative base paths.
The RDF adapter retains that lineage through context clones and applies the
reference's normalization passes for direct IDs, prefixes, types and coerced
scalars. It preserves query inheritance and fragment handling without inventing
a filesystem origin. Separate unbased-node captures cover those paths, including
spaces introduced by the final base join; raw spaced node references still drop
at the reference's pre-resolution check.

Explicit ID-only node objects revert a nonpropagating type scope. Scalar ID
coercion resolves its string before node insertion, and property scopes inherit
their selected parent terms. Literal value objects use that selected property
context and ignore their own local context. Empty ordinary-node local contexts
reset inherited terms. Preparation copies those decisions without replacing the
original numeric-token parents, preserving native numbers and JSON literals.
Independent PyLD controls retain the standard expansion behavior of ID-only
references, local contexts and literal datatypes.

`npm ci` applies the exact-version patch through the private workspace's
`postinstall` script and fails if it cannot apply. The build includes the
patched implementation in each published validator and worker bundle. Installed
package consumers do not run a patching script or download this dependency.

When changing the JSON-LD dependency, review the patch against that version and
run the live Python corpus, declaration checks and installed package browser
qualification. Keep the key-collision regressions even if an upstream release
makes the patch unnecessary, together with the independently captured native
numeric/JSON terms and complete crate controls. Dependency copyright notices and
bundled license files remain part of the build output.

Imported contexts are merged into a private copy. Importing a term named
`__proto__` must preserve that mapping, and local overrides must not change the
cached imported source or another entity's terms. The adapter scopes its
resolver cache to the immutable document-loader snapshot, keeping sequential
and concurrent validations independent even when they use the same context URL.

The context fixtures record triples and interrupted parsing from locked RDFLib
using identical input documents and offline context responses. Hosted reference qualification
regenerates them. Regressions cover inline, remote and imported own keys, local
and per-entity overrides, repeated URLs, concurrent loaders and serialized
remote propagation settings.

Installed Node consumers and native/bundled browser workers verify both parsed
and serialized remote context responses. Propagation enabled completes valid;
propagation disabled remains incomplete and cannot approve submission even when
its report contains no findings.

Value-object JSON typing requires an actual `@type` key or a context-defined
alias. A missing key remains distinct from an ordinary property named
`undefined`; that spelling may still be a legitimate `@type` alias when declared.

RDF node-identity expansion also preserves raw base, vocabulary and prefix
recipes in private context sidecars. Dependency markers are checked only after
conversion and only in the consumed default graph. Context clones copy those
recipes; guarded RDF resolver caches belong to one dataset conversion so its
base cannot leak into another conversion. Predicates, literal datatypes,
unused mappings and ordinary literal strings do not acquire these markers.

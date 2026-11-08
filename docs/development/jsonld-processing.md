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

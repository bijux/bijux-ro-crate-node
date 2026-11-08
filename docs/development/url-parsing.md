# URL parsing

Metadata URL fields use the pinned `whatwg-url` 14.1.0 state machine rather than
the platform URL constructor. The model adapter consumes only its parser and
serializers, so browser-specific file-host, drive and opaque-host behavior does
not change validation. `tr46` remains exactly 5.0.0 with Unicode 15.1 data; the
dependency tree must contain a single copy.

The original authority spelling is checked before mapping. Only the hostname is
replaced; credentials, paths, query strings and fragments retain their separate
URL rules. Unicode mappings and percent-decoded domains participate in IPv4
validation before port diagnostics. File credentials and ports keep their own
syntax precedence. Opaque schemes keep their independent host grammar.

An exact-version dependency patch rejects an ACE label that decodes to an empty
Unicode label when invalid Punycode is forbidden. Ordinary empty labels and
Unicode characters ignored by IDNA retain their reference behavior. Lone UTF-16
surrogates fail string decoding before URL syntax checks; valid surrogate pairs
remain normal Unicode input.

The state-machine patch exposes an opt-in file compatibility mode for the pinned
[Rust URL 2.5.4 parser](https://github.com/servo/rust-url/blob/v2.5.4/url/src/parser.rs).
Empty-host parsing retains its leading empty segment until
path reduction finishes. A first drive selects a local path; later drive segments
anchor parent traversal. Normalized bare drives receive their path separator,
and leading empty segments collapse only after parsing. Ordinary dependency calls
keep WHATWG behavior. Other paths and query/fragment bytes stay in the pinned
state machine.

Independent Pydantic captures cover these boundaries. Whole-crate fixtures check
complete model findings, and real browser probes check normalized values across
Chromium, Firefox and WebKit. A clean install must reapply the same dependency
patches and retain the bundled MIT notices.

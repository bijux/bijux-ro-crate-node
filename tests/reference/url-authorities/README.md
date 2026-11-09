# URL authority contracts

The pinned Pydantic core 2.41.5 uses Rust URL 2.5.4. Its parser accepts two
inputs that the [URL Standard](https://url.spec.whatwg.org/) requires rejecting:
an empty host after `@` at EOF, and a backslash ending a non-special port.
Node retains the standards-correct rejection.

Twenty-seven complete crates retain five original Python approvals and agreeing
neighbors. Each correction uses the exact report of an unchanged-Python rejected
counterpart: append `/` after the empty userinfo, or replace the port backslash
with `x`. Only that website spelling changes; metadata, manifest, contexts,
severity, location and all findings remain strict. The original captures are
preserved separately from the counterpart contract.

The [authority rule](https://url.spec.whatwg.org/#authority-state) includes EOF
in its empty-host check. The [port rule](https://url.spec.whatwg.org/#port-state)
permits a backslash terminator only for special schemes. The pinned
[Rust parser](https://docs.rs/crate/url/2.5.4/source/src/parser.rs) misses EOF
in `parse_userinfo` and does not test the scheme in `parse_port`; Pydantic's
[lock](https://github.com/pydantic/pydantic-core/blob/v2.41.5/Cargo.lock)
records that exact dependency. These are upstream corrections, outside ordinary
exact agreement. Source, installed packages and browser Sessions retain the
same complete reports and continuation decisions.

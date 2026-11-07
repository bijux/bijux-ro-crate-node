# Shared standards adoption

The repository consumes the exact accepted `bijux/bijux-std` commit recorded in
[the source pin](../../.github/standards/bijux-std.sha). The `node` capability
includes common checks, GitHub governance, neutral Make modules and Node
workspace targets. Documentation, Python and Rust libraries are not installed.
Git, Python and Ruby support development-time standards checks. The independent
reference additionally needs its locked Python environment; shipped package validation runs in JavaScript.

`make node-check`, `make node-test` and `make node-build` delegate to the owning
npm scripts. The private root owns dependency ordering; core and validator retain
their public package boundaries. `make help` lists the supported Make surface.

`make bijux-std-checks` fetches the pinned GitHub source and requires its shared
library digests to match. `make bijux-standard-check` prepares an immutable source
cache under `artifacts/standards/accepted-source/<sha>` and runs that source's own
governance verifier. It refuses foreign origins, dirty caches and path aliases.
The verifier checks canonical workflow projection and owned workflow admission;
it does not trust a rewritten local checksum manifest as independent authority.
The source pin must be tracked before this check can pass.

Managed `.bijux/shared/` and generated `.github/` files are refreshed through the
accepted upstream updater and governance generator. Update their checksum
manifest together and verify it before committing. Repository-owned validation
and package-candidate workflows keep product commands and runtime matrices.
Dependency proposals produce a distinct notice; human pull requests run the
required validation. Accepted-PR evidence avoids duplicate push verification.

The canonical npm capability is disabled in accepted configuration. Its workflow
is manual, requires controller admission and an immutable successful package
candidate, and has a protected `npm-publication` environment. Adoption is not a
publication receipt or proof of npm namespace control. See the
[release procedure](release.md) for the separate owner and release prerequisites.

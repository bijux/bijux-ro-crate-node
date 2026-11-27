# Architecture and contributor path

Core owns crate inputs, resources and diagnostics; validator owns BIA
validation and its browser and worker interfaces. Creator owns editable study
drafts, scientific relationships, file manifests and preservation-aware import;
it depends on core, without importing validator internals. Their package manifests own
public exports and dependency declarations. Production imports between packages
use those exports. Package tests may inspect their own internals. Shared test
support may depend on other support modules, external or public packages, and
the workspace-root helper; other repository modules remain outside that layer.
This keeps support independent of CI and test command entrypoints. A reusable
repository helper needed by support should have a neutral owner in that layer.

`npm run check:boundaries` checks package source and shared `tests/support`
imports, including type-only imports and resolved paths. In those directories,
direct `import()` and recognized Node `require()` calls with computed specifiers
are rejected because their destinations cannot be checked statically. Local
functions named `require` are not treated as loaders. Wrapper-scope `var require`
in CommonJS-capable files is conservatively treated as a loader because it can
refer to the wrapper parameter before assignment. For `.js` and `.ts`, this
rule is relaxed only when a valid NodeNext compiler configuration includes the
source and its nearest package scope establishes ESM; relocated or ambiguous
sources remain conservative. Explicit `.mjs` and `.mts` files do not have this ambiguity. This
is not a runtime sandbox: arbitrary loader aliases, injected loaders, external
bundler transformations and dynamically executed code are outside its analysis.
`npm run check:workspace` includes this check and
validates workspace metadata. The runtime-entry inventory owns checked-in
generated JavaScript and its review attributes; package builds own `dist/`.
The independent Python oracle and checked-in reference evidence are deliberate
compatibility boundaries, not package runtime dependencies.

For a focused change, locate the owning test as described in
[contributing](contributing.md), build when that test needs package output,
and run its test file. Use the exact-name parity and browser commands in
[validation checks](validation-checks.md) to reproduce an individual failure.
Those commands do not replace the complete independent-reference, browser and
installed-package qualification.

Creator has its own source, public exports, strict compiler projects and
installed Node and browser consumer scenarios. These exercise the packed public
API rather than source-workspace resolution. Add new package scenarios to
[the consumer planner](../../tests/package/consumers.mts) and keep checked
TypeScript inputs under [consumer fixtures](../../tests/package/fixtures/).
Follow [package ownership](workspaces.md) and the existing third-workspace
checks when adding another domain. Browser or worker needs belong at their
appropriate boundary; standards and publication changes follow their normal
upstream process.

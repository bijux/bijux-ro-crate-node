# Architecture and contributor path

Core owns crate inputs, resources and diagnostics; validator owns BIA
validation and its browser and worker interfaces. Their package manifests own
public exports and dependency declarations. Production imports between packages
use those exports. Package tests may inspect their own internals, while shared
test support stays independent of CI and test command entrypoints.

`npm run check:boundaries` checks these ownership edges, including type-only
imports and resolved paths. `npm run check:workspace` includes this check and
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

A future creator package needs a real public workspace with its own source,
exports, compiler projects and installed-consumer scenario. Its browser or
worker needs belong at the appropriate boundary. Follow
[package ownership](workspaces.md), including the existing third-workspace
checks; make standards and publication changes through their normal upstream
process when needed. No creator package is assumed to exist yet.

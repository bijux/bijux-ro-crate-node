# Package ownership and extension

The root is private. `packages/core` owns crate input safety, immutable byte
snapshots, trusted resource loading and generic diagnostic reports.
`packages/validator` depends on core's public exports and owns BIA models,
JSON-LD/RDF interpretation, profile resources, manifests and browser lifecycle.
Core must never import validator, BIA rules or a UI integration.

Each package owns its manifest, version, public entrypoints, declarations,
README, LICENSE/NOTICE, optional LICENSES and governed `dist/`. Product source
is grouped by responsibility: metadata/models, metadata/rdf, profile, manifest, validation,
worker and browser. Core groups crate paths/files, trusted resources and diagnostics
under distinct owned domains. Each package keeps its behavior tests under
`tests/<domain>/`; independent Python parity, real browser integration, public
type checks and installed-consumer tests remain at the repository root. Third-party runtime code is bundled with attribution; core
remains a declared versioned dependency of validator's public API.

## Add another RO-Crate domain

Create `packages/<domain>/package.json` with a stable domain name, version,
repository.directory, ESM `exports` containing `import` and `types` targets,
explicit publish allowlist and dependencies. Author TypeScript entrypoints under
`src/` matching the export names; do not maintain separate handwritten `.d.ts`
entrypoints. Set `bijux.declarations` to the package's declaration compiler
project, `bijux.typecheck` to its compiler projects, and `bijux.standaloneEntries`
to export keys that must bundle their dependencies. The build emits declarations
from TypeScript and includes their relative dependencies in `dist/`. Paths must
identify files within the package; symlinks must stay inside it and not form
cycles. Register all package compiler projects in
`bijux.typecheck`, including the declaration project, and include authored
TypeScript in at least one registered project. Inherited config-only bases do
not need separate registration. Projects must enable `strict`
without disabling its individual checks and leave `noCheck` and `skipLibCheck`
disabled. Package sources must not use `@ts-nocheck`; package `src/` contains
TypeScript rather than JavaScript, and the declaration project must leave
`allowJs` disabled. Typechecking rejects local JavaScript runtime dependencies;
dynamic import and module-loader require targets must be string literals; local
helper functions are exempt. Runtime URL imports are rejected. Root `npm run
check:types` runs
those projects and the explicit integration projects, then verifies generated
runtime entries. Add a clean installed-consumer scenario to distribution
qualification for every new public package.

Import other workspaces only through their public package names. Public release
dependencies use exact available versions; do not put `workspace:`, `file:`,
`link:` or source-relative imports in distributed metadata. Do not create an
empty package to reserve a possible future boundary.

Root orchestration discovers package directories and orders their declared
runtime dependency graph, rejecting cycles. Build/pack commands explicitly
select public workspaces; the root is never publishable. Give each public
package a meaningful `test` script: root `npm test` runs owned workspace tests
in dependency order, then independent comparator controls. Domain behavior and
installed-consumer checks must cover new public behavior. Add new public package consumers and release identity
checks to distribution qualification rather than assuming workspace resolution
proves isolation.

## Verify the boundary

`npm run check:workspace` checks dependency ordering and metadata.
`npm run test:pack` packs in dependency order, inspects allowlists/exports and
installs actual archive bytes into clean consumers under root artifacts.
Core is installed alone; validator is installed with its declared core package,
with assertions rejecting source-workspace resolution. Consumers exercise ESM,
separate Node-only and DOM-only strict TypeScript, native browser imports,
bundling and real module workers. Consumer resolution and archive integrity
checks prevent workspace fallback; test-only type archives come from the locked
development dependencies and install without registry metadata cache assumptions.

Build output under package `dist/` is a governed generated destination. All
other generated run products belong under root `artifacts/` and are ignored.
Nothing under `artifacts/` is an imported runtime dependency of either package.

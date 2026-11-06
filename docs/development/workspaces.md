# Package ownership and extension

The root is private. `packages/core` owns crate input safety, immutable byte
snapshots, trusted resource loading and generic diagnostic reports.
`packages/validator` depends on core's public exports and owns BIA models,
JSON-LD/RDF interpretation, profile resources, manifests and browser lifecycle.
Core must never import validator, BIA rules or a UI integration.

Each package owns its manifest, version, public entrypoints, declarations,
README, LICENSE/NOTICE, optional LICENSES and governed `dist/`. Product source
is grouped by responsibility: metadata/models, profile, manifest, validation,
worker and browser. Third-party runtime code is bundled with attribution; core
remains a declared versioned dependency of validator's public API.

## Add another RO-Crate domain

Create `packages/<domain>/package.json` with a stable domain name, version,
repository.directory, ESM `exports` containing `import` and `types` targets,
explicit publish allowlist and dependencies. Provide runtime source entrypoints
under `src/` matching those exports, plus the corresponding `.d.ts` files.
The build derives each source entrypoint from its `./dist/` target; it copies
that declaration. Avoid undeclared declaration dependencies between files.

Import other workspaces only through their public package names. Public release
dependencies use exact available versions; do not put `workspace:`, `file:`,
`link:` or source-relative imports in distributed metadata. Do not create an
empty package to reserve a possible future boundary.

Root orchestration discovers package directories and orders their declared
runtime dependency graph, rejecting cycles. Build/pack commands explicitly
select public workspaces; the root is never publishable. Package-local tests
are optional; domain functional tests and installed-consumer checks must cover
new public behavior. Add new public package consumers and release identity
checks to distribution qualification rather than assuming workspace resolution
proves isolation.

## Verify the boundary

`npm run check:workspace` checks dependency ordering and metadata.
`npm run test:pack` packs in dependency order, inspects allowlists/exports and
installs actual archive bytes into clean consumers under root artifacts.
Core is installed alone; validator is installed with its declared core package,
with assertions rejecting source-workspace resolution. Consumers exercise ESM,
strict TypeScript, native browser imports, bundling and real module workers.

Build output under package `dist/` is a governed generated destination. All
other generated run products belong under root `artifacts/` and are ignored.
Nothing under `artifacts/` is an imported runtime dependency of either package.

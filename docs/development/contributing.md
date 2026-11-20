# Contributing

Start with the package that owns the behavior: `packages/core` owns crate input,
resource safety and diagnostics; `packages/validator` owns BIA validation and
browser sessions. Package behavior tests live under the corresponding package's
`tests/`. Repository-level `tests/` contains cross-package, browser, parity and
installed-consumer checks. See [package ownership](workspaces.md) for boundaries
and the current limitations on adding a package.

## Local loop

Use Node 22 or 24, then run `npm ci`. Edit the owning TypeScript source and its
tests. Run the package's `npm test --workspace @bijux/ro-crate-core` or
`npm test --workspace @bijux/ro-crate-validator` for a focused check; build
first with `npm run build` when the tests depend on package output. Run
`npm run build` before `npm run check:types` on a fresh checkout: the editor
example resolves built package output. The typecheck covers the separate source,
test, browser and worker projects and generated-entry checks. `npm test` builds
and runs the ordinary local test suite. `npm run check:workspace` checks workspace metadata and dependency order.
The root `tsconfig.json` helps editors find projects; it is not the full check.

Use `npm run test:parity -- --snapshot` for snapshot compatibility checks.
Independent live parity requires the pinned Python reference environment; browser
and release qualification require additional tools. The README gives setup and
commands, and [validation checks](validation-checks.md),
[compatibility evidence](../compatibility/PARITY.md) and the
[release procedure](release.md) explain the broader checks and prerequisites.
CI also exercises installed archives, browsers and independent reference results;
a passing focused local test does not replace those checks.

## Generated files and review

Package implementation and public types are authored in TypeScript. The build
emits JavaScript and declarations into each package's ignored `dist/`; do not edit
those outputs. Checked-in runtime entries carry a generated banner naming their
`.mts` source and generation command. Edit that source, then run
`npm run generate:runtime` (or `npm run generate:admission` for the admission
entry). Commit the resulting entries with the source. `npm run check:types`
checks that registered entries are current. They exist for direct execution on
supported Node 22 releases, including admission before dependency restoration.

The exact checked-in runtime entries are marked generated in `.gitattributes` so
GitHub can collapse their diffs. When adding, moving or removing an entry, keep
that list aligned with the generator; do not classify handwritten JavaScript by
extension. Review the source and inspect the generated diff when necessary.
Other generated data and reference captures have their own provenance and
regeneration instructions in the relevant compatibility documentation. Managed
shared standards follow [standards adoption](standards-adoption.md).

A pull request should describe the behavior and evidence, include relevant tests
and generated entries, and record the change in the repository changelog with
its pull request link once available. Report checks run and any prerequisites or
checks that were unavailable.

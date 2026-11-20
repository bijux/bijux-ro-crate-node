# Validation checks

CI prepares package archives and the locked Python runtime once per run. Each
consumer verifies its bundle digest, source commit and dependency pins before
using it. Package tests use installed archives; source tests use the checkout.

`scripts/ci/runtime-bundles.mts` supplies owned roots to the separate Python
archive inspector at `scripts/ci/inspect-runtime-archive.py`. It checks archive
headers before extraction; its work is separate from the independent Python
validator used for parity comparisons. The runtime Python must support
`TarFile.extractall(filter=...)` and `TarInfo.replace`.

The live Python comparison runs in twelve fixture shards. Browser Worker and
Session comparisons run in four fixture shards for each of Chromium, Firefox
and WebKit, with source and installed comparisons running concurrently. The
separate required **Upstream defect guards** job retains original Python captures
and verifies approved corrections. Its literal capture uses two processes. Interaction,
ownership, defect and package application checks run in full for each engine. Node package
checks retain both supported runtimes.

Source interaction guards run alongside the ordered installed-package guards and
applications. Their receipts and native-picker fixtures have separate ownership;
both groups must finish successfully before the browser job can pass.

Browser jobs use the official Playwright 1.64.1 Noble image pinned to its
Linux amd64 manifest digest. The image owns browser and system-library bytes;
the npm lock owns the matching client. A preflight checks the image version,
locked browser revisions, executable paths and a real launch before running the
full checks. Receipts record the image digest and actual browser version rather
than assuming binary identity from a revision number. Node remains pinned to
24.3.0. Containers run as `pwuser` so mounted home directories and browser
profiles share ownership. They use private shared memory and an init process,
without privileged access or host networking.

The required-jobs gate runs before dependency restoration in aggregate jobs.
Its authored source is `scripts/ci/require-jobs.mts`; the checked-in
`require-jobs.mjs` is its dependency-free generated entry. Run
`npm run generate:admission` after changing the source. `npm run check:types`
checks that the generated entry is current.

The required Python and browser gates accept only successful prerequisite jobs
and complete execution receipts. Missing, repeated, foreign or failed fixture
results fail coverage. Default local commands still run the full fixture corpus
and all engines.

The parity launcher, workspace and package tools, HTTP example, verification
entries and oracle partition controls use `.mts` sources under `scripts/`.
Parity byte checks, result comparison and case coverage controls use `.mts`
sources under `tests/`. Their checked-in `.mjs` entries support direct execution on all
supported Node 22 releases. Run `npm run generate:runtime` after changing any source;
`npm run check:types` verifies that the generated entries are current.

To rerun one parity case by its exact reported name, run
`npm run test:parity -- '--case=upstream/test_duplicate_entity_id'`. This uses
the live Python reference; add `--snapshot` to compare with the checked-in
qualified snapshot. Unknown names and combinations with a shard fail. A focused
run cannot record expectations or qualify full coverage. Failures show a
reproduction command and retain complete details in `artifacts/reports/`. The
command removes the shard selector. For installed comparisons, it requires the
existing `BIJUX_VALIDATOR_MODULE` binding; for source comparisons, it clears it.
Installed detailed receipts record the binding; the ordinary console summary
does not print it.

To run the browser repair journey in Chromium, use
`BIJUX_TEST_ENGINE=chromium npm run test:live`. It exercises metadata and
manifest repair, continuation with approved bytes, and malformed input refusal.
Omit the engine selector to run all three browsers.

For shard troubleshooting, use `BIJUX_TEST_SHARD=0/12 node --import tsx tests/parity/run.mjs`
or `BIJUX_TEST_ENGINE=chromium BIJUX_TEST_SHARD=0/4 node tests/browser/parity.mjs`.
Shard indexes start at zero. Recording expectations requires the complete corpus.

## Hosted timing and budget

Use ten minutes as a provisional planning budget for the elapsed Validation
workflow, from the run start to completion, including runner queues and the
required aggregation jobs. This is an investigation threshold, not a job timeout
or a guaranteed upper bound: runner availability and dependency downloads vary
outside the workflow's control. Package tests have an eight-minute job timeout;
other Validation jobs use five- or eight-minute limits. Those execution limits do not include time
spent waiting for a runner and are not a bound on the complete workflow.

A successful [hosted run on November 20, 2026](https://github.com/bijux/bijux-ro-crate-node/actions/runs/44802563058)
provides a historical baseline at head commit `a28da69ee837000832e7ff892196af09d45034e0`.
The workflow and qualification suite have since changed, so this measurement
does not describe the current head. All 70 jobs succeeded in that run. GitHub recorded the run from
19:29:14 to 19:36:00 UTC, or 6m46s. The jobs API reports timestamps to whole
seconds, so the following intervals are approximate and follow the observed
critical path rather than summing parallel jobs.

| Critical-path interval | Elapsed |
| --- | ---: |
| Prepare the package inputs and pinned Python runtime in parallel; the Python runtime completed last | 46s |
| Make the live-parity shard eligible after preparation | 1s |
| [Live parity shard 11](https://github.com/bijux/bijux-ro-crate-node/actions/runs/44802563058/job/136518589228), created to started | 132s |
| Shard 11 execution, started to completed | 210s |
| [Python reference gate](https://github.com/bijux/bijux-ro-crate-node/actions/runs/44802563058/job/136521679868), created to completed | 16s |
| Workflow completion after the last job | 1s |
| **Total** | **406s** |

The slower preparation job, [Prepare pinned Python runtime](https://github.com/bijux/bijux-ro-crate-node/actions/runs/44802563058/job/136518185698),
waited 3s and ran for 43s; its Python setup took 9s, environment creation and
installation took 8s, and verification and ontology preparation took 2s. The
parallel [package preparation](https://github.com/bijux/bijux-ro-crate-node/actions/runs/44802563058/job/136518185489)
waited 2s and ran for 24s, including 2s for `npm ci` and 10s for its combined
build, pack and consumer preparation step. These step timings are measurements
of this run, not separate serial additions to the critical path.

Shard 11 spent 168s in live comparison and 42s in setup, dependency restoration,
upload and gaps between steps. Within that 42s, Node and Python setup took 14s
and the two artifact downloads and restores took 17s. Across the twelve parity
shards, the observed created-to-started delays ranged from 99s to 132s and
execution ranged from 137s to 210s. Created-to-started is the observable
scheduling delay; it does not identify why a runner was unavailable or prove a
cache hit or miss. No change to fixture, browser, installed-consumer or reference
coverage is implied by this budget.

The ten-minute allowance leaves 3m14s above this observation for variation; it
is not a percentile derived from one run. Collect at least 20 comparable
successful pull-request runs, retaining run and job timestamps and noting known
cold or warm dependency states, before setting a percentile-based service target.
Investigate repeated overruns by separating prerequisite preparation, queue,
execution and aggregation rather than removing qualification coverage.

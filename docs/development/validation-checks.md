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
other Validation jobs use five- or eight-minute limits. Those execution limits
do not include time spent waiting for a runner and are not a bound on the
complete workflow.

A successful [hosted run on November 20, 2026](https://github.com/bijux/bijux-ro-crate-node/actions/runs/44802563058)
provides a historical baseline at head commit `a28da69ee837000832e7ff892196af09d45034e0`.
The workflow and qualification suite have since changed, so this measurement
does not describe the current head. All 70 jobs succeeded in that run. GitHub
recorded the run from 19:29:14 to 19:36:00 UTC, or 6m46s. The jobs API
reports timestamps to whole seconds, so the following intervals are approximate and follow the observed
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

## Later runs using the archive-candidate workflow

Three later successful pull-request runs used a `validation.yml` identical to
the archive candidate at `07a01df`. Each run had 70 successful jobs and twelve
successful live-parity shards. The queue and execution times below describe the
last-finishing live-parity shard, which need not be the critical-path job.

| Run | Head | Elapsed | Last parity shard queue | Last parity shard execution |
| --- | --- | ---: | ---: | ---: |
| [44814482671](https://github.com/bijux/bijux-ro-crate-node/actions/runs/44814482671) | `70eb50a` | 422s | 129s | 223s |
| [44812977161](https://github.com/bijux/bijux-ro-crate-node/actions/runs/44812977161) | `32364d2` | 403s | 126s | 210s |
| [44811651113](https://github.com/bijux/bijux-ro-crate-node/actions/runs/44811651113) | `4c96140` | 422s | 132s | 168s |

These runs measured earlier code and qualification suites, not `07a01df`:
compiler-registration and archive-inspection changes were added afterward.
As of November 20 at 20:58 UTC, the Validation run for the
compiler-registration candidate was not complete, and no pull-request Validation run existed for `07a01df`.
Do not treat these three measurements as current-head timing or as a reliable
performance distribution. Refresh the budget after a completed run of the
intended head and a broader set of comparable runs.

## Historical comparison

An earlier snapshot of 20 successful pull-request Validation runs contained
13 first-attempt runs with a byte-identical `validation.yml` to the historical
baseline, which differs from the archive candidate workflow. Each had 70
successful jobs, including all twelve live-parity shards.
Six of the 20 had a different workflow definition; one was a third attempt.
Those seven are excluded. The selected runs were created between November 19
at 21:17 UTC and November 20 at 19:36 UTC. They have different commits, so a
matching workflow file does not prove identical code, fixture cost, runner
contention or cache conditions.

For each run, elapsed time is the API's `updated_at` minus `run_started_at`.
The last completed job in each selected run finished zero or one second before
`updated_at`. The queue and execution columns describe the last-finishing live
parity shard, which is not necessarily the critical-path job in every run.
Times are whole-second measurements from the GitHub jobs API.

| Run | Elapsed | Last parity shard queue | Last parity shard execution |
| --- | ---: | ---: | ---: |
| [44803783315](https://github.com/bijux/bijux-ro-crate-node/actions/runs/44803783315) | 387s | 111s | 208s |
| [44802563058](https://github.com/bijux/bijux-ro-crate-node/actions/runs/44802563058) | 406s | 132s | 210s |
| [44800977794](https://github.com/bijux/bijux-ro-crate-node/actions/runs/44800977794) | 420s | 131s | 228s |
| [44795558440](https://github.com/bijux/bijux-ro-crate-node/actions/runs/44795558440) | 404s | 136s | 209s |
| [44647018716](https://github.com/bijux/bijux-ro-crate-node/actions/runs/44647018716) | 460s | 124s | 206s |
| [44645888832](https://github.com/bijux/bijux-ro-crate-node/actions/runs/44645888832) | 447s | 135s | 241s |
| [44644502042](https://github.com/bijux/bijux-ro-crate-node/actions/runs/44644502042) | 408s | 125s | 207s |
| [44630630928](https://github.com/bijux/bijux-ro-crate-node/actions/runs/44630630928) | 439s | 117s | 215s |
| [44629166337](https://github.com/bijux/bijux-ro-crate-node/actions/runs/44629166337) | 457s | 125s | 213s |
| [44624267578](https://github.com/bijux/bijux-ro-crate-node/actions/runs/44624267578) | 434s | 135s | 225s |
| [44621952107](https://github.com/bijux/bijux-ro-crate-node/actions/runs/44621952107) | 439s | 129s | 207s |
| [44619269312](https://github.com/bijux/bijux-ro-crate-node/actions/runs/44619269312) | 398s | 116s | 214s |
| [44617300751](https://github.com/bijux/bijux-ro-crate-node/actions/runs/44617300751) | 403s | 123s | 213s |

In this historical sample, elapsed time ranged from 6m27s to 7m40s with a 7m
median.
The last-finishing parity shards waited 1m51s to 2m16s, with a 2m05s median,
and ran for 3m26s to 4m01s, with a 3m33s median. The ten-minute allowance
leaves 2m20s above the slowest run in that historical sample. It remains a
provisional planning threshold, not a percentile or service guarantee: the sample is small, confined
to roughly one day, and excludes failed runs and reruns. Collect more comparable
runs across days and workload conditions, retaining timestamps and known cold
or warm dependency states, before proposing a percentile-based target. Investigate
repeated overruns by separating preparation, queue, execution and aggregation
rather than removing qualification coverage.

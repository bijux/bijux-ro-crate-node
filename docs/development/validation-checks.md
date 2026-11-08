# Validation checks

CI prepares package archives and the locked Python runtime once per run. Each
consumer verifies its bundle digest, source commit and dependency pins before
using it. Package tests use installed archives; source tests use the checkout.

The live Python comparison runs in twelve fixture shards. Browser Worker and
Session comparisons run in three fixture shards for each of Chromium, Firefox
and WebKit, with source and installed comparisons running concurrently. The
separate required **Upstream defect guards** job retains original Python captures
and verifies approved corrections. Its literal capture uses two processes. Interaction,
ownership, defect and package application checks run in full for each engine. Node package
checks retain both supported runtimes.

The required Python and browser gates accept only successful prerequisite jobs
and complete execution receipts. Missing, repeated, foreign or failed fixture
results fail coverage. Default local commands still run the full fixture corpus
and all engines.

For a focused local run, use `BIJUX_TEST_SHARD=0/12 node tests/parity/run.mjs`
or `BIJUX_TEST_ENGINE=chromium BIJUX_TEST_SHARD=0/3 node tests/browser/parity.mjs`.
Shard indexes start at zero. Recording expectations requires an unsharded run.

Each CI job has a five-minute limit. The full validation critical path targets under
three minutes, with five minutes as the maximum acceptable execution time. Check
hosted timings, including preparation and aggregation, before claiming that
budget is met; runner queues and cold dependency downloads also affect elapsed
time. Time limits fail slow runs rather than omitting coverage.

# Package release procedure

The release set is public core 0.1.0 followed by validator 0.1.0, whose core
dependency is exact. The private workspace root is excluded. Package names
`@bijux/ro-crate-core` and `@bijux/ro-crate-validator` remain proposed until
scope control is verified. No package is claimed published by this candidate.

## Freeze and qualify source

Use a clean accepted main commit after all dedicated PRs have merged. Confirm
current-head hosted validation, exact reference source/environment and source
asset hashes. Run live Python/Node differentials, browser corpus, repair/race/
offline/display checks, workload measurements and package consumers. Require
zero unexplained mismatches and zero required-case skips. Snapshot replay is
useful during development but cannot independently establish release parity.

`npm run test:pack` builds workspaces in dependency order, explicitly packs each
public workspace, checks export targets and allowlists, and writes
`artifacts/packages/manifest.json`. It installs those exact archives into clean
core-only and validator consumers and checks ESM, strict TypeScript, Node22/24,
native browsers, bundling, real workers and the full installed parity corpus.
The manual **Package candidate** workflow prepares these artifacts without
publishing them. Capture accepted commit, source tree, package-lock hash, each
archive SHA-256/integrity, corpus identity and actual check receipts together.
A source or archive change invalidates any affected qualification.

## Canonical publication dependency

The previously inspected accepted `bijux-std` source at
`c3b22a7be99304592a379dc83f51d7397d372efb` has no repository registration,
Node workspace capability or canonical npm publisher. Remote main advanced
after that inspection; review the newer accepted contract before planning or
adopting upstream changes. This repository therefore
does not install a credentialed downstream publication workaround. The durable
upstream change must register check producers, package identity/admission and
an npm publisher in shared standards and its infrastructure dispatch contract.
After acceptance, consume the exact GitHub reference using its updater and
validate the shared checksum manifest. See [standards adoption](standards-adoption.md).

## Registry setup

Confirm actual owner control of the scope and both names; unauthenticated 404
responses prove neither availability nor publish permission. Record the exact
GitHub repository and public visibility. The local npm11.4.2 used for candidate
packing is below the current OIDC minimum: use a verified supported npm >=11.5.1
with Node >=22.14.0 in the canonical publishing job.
[Official trusted-publisher guidance](https://docs.npmjs.com/trusted-publishers/)
describes GitHub-hosted OIDC and the exact owner/repository/workflow/environment
binding. Public repository/public package trusted publishing automatically
produces provenance; do not invent a provenance receipt for a local pack.

For a package that has no settings yet, an authenticated authorized owner must
establish the first package using a supported bootstrap. Current
[scoped-package guidance](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/)
documents direct public publication with 2FA or suitable granular-token access,
and staged publishing followed by owner 2FA approval. Staging a new name can
itself create a public placeholder, so it is a registry write and requires
release authorization. Do not publish a dummy version to reserve names.
Choose the actual supported bootstrap with the owner before release, then bind
each package to the accepted canonical workflow. Keep credentials out of logs,
source, artifacts and PR descriptions.

## Publish the inspected bytes

Within explicit release authority, dispatch the accepted canonical publisher
for the exact accepted source and named release set. Ordinary PRs, pushes and
candidate workflows cannot publish. It must verify admission/checks and the
qualified archive digests, then publish the already inspected core archive
with public access. Verify core 0.1.0 registry integrity/availability before
publishing the validator archive. Avoid a second unqualified pack at publish.
Record registry receipts, package versions, archive identities, source tag/SHA
and available provenance. Tags/releases must identify the same qualified source.

If core succeeds but validator fails, the release remains incomplete. Verify
the existing immutable bytes and resume only the missing package after resolving
the failure. Never overwrite/relabel 0.1.0, unpublish to retry or silently bump.

## Verify what users install

In new consumers, install exact public registry versions without local archives,
workspace links or source fallback. Verify core alone, validator's declared core
dependency, ESM/strict TypeScript and the installed browser worker lifecycle.
Run the full same-corpus differential through registry-installed validator and
compare registry integrity with the qualified archives. Record package URLs,
versions, accepted main and provenance verification. Publication is complete
only after these real consumers pass. Candidate artifacts and local green
checks do not satisfy that milestone.

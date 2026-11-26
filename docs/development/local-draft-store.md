# Local account and draft reference

This private, loopback-only reference combines Keycloak, PostgreSQL, the creator
recovery codec and Astro server routes. It prepares account and revision
contracts for local qualification. It is not a BSS, DEV or production identity,
storage or archive integration. The editor exposes a local account panel when
the reference is enabled.

## Reference services and checks

`ops/local-authoring/compose.yaml` runs Keycloak 26.8.2 and
PostgreSQL 17.12 on loopback ports. Its imported realm, two research accounts,
credentials, HTTP issuer and fixed callback are disposable development fixtures.
Keycloak and the Astro server use the same PostgreSQL service. The local routes
are disabled unless `BIJUX_LOCAL_REFERENCE=1`; their issuer, database and
origin are fixed to the local reference. There is no production fallback.

Install and build the root workspace packages, then install the local reference
package's locked dependencies and start the isolated Compose project:

```sh
npm ci
npm run build
reference_compose=ops/local-authoring/compose.yaml
docker compose -p bijuxauthoringaccounts -f "$reference_compose" up -d
npm --workspace @bijux/ro-crate-web run check
npm --workspace @bijux/ro-crate-web run test:local-recovery
npm --workspace @bijux/ro-crate-web run test:local-identity
npm --workspace @bijux/ro-crate-web run test:local-session
```

Wait for `http://127.0.0.1:18080/realms/authoring/.well-known/openid-configuration`
before running identity tests. Playwright requires an installed Chromium browser.
Astro uses its own private recovery codec; creator and core are consumed through
their declared public package exports. The account controls remain disabled when the local reference environment flag
is absent.

The migration and draft integration checks require
`DRAFT_REFERENCE_DATABASE_CONTAINER=bijuxauthoringaccounts-database-1` and a
Docker client on `PATH`. **They modify the dedicated Compose database.** The
migration check drops the three service-owned schemas, so run it before other
checks and only on disposable data. The draft check restarts the database and
identity containers. In the tested setup Keycloak needed its own restart after
the database restart, which the check performs before a fresh login.

```sh
DRAFT_REFERENCE_DATABASE_CONTAINER=bijuxauthoringaccounts-database-1 npm --workspace @bijux/ro-crate-web run test:local-migrations
DRAFT_REFERENCE_DATABASE_CONTAINER=bijuxauthoringaccounts-database-1 npm --workspace @bijux/ro-crate-web run test:local-drafts
```

The separate destructive SQL store test requires `DRAFT_TEST_POSTGRES` naming a
dedicated container beginning `bijuxauthoring-accounts-test-`, with a `drafts`
database and `postgres` user. It drops `draft_store` and restarts that container.
Run `npm --workspace @bijux/ro-crate-web run test:local-persistence` only on disposable
data. `docker compose -p bijuxauthoringaccounts -f "$reference_compose" down`
stops the Compose project and preserves its named volume; adding `-v` deletes it.
The realm import is applied only on an empty database.

References: [Keycloak container guide](https://www.keycloak.org/server/containers),
[Keycloak Docker guide](https://www.keycloak.org/getting-started/getting-started-docker),
and [openid-client documentation](https://github.com/panva/openid-client/tree/main/docs).

## Identity and database ownership

Login uses authorization code, PKCE, state and nonce. The session cookie contains
a random token; PostgreSQL stores its hash, issuer, subject and expiry. Logout
requires the exact configured Origin. Development HTTP cookies and database
credentials are not suitable for production. The pinned `openid-client` marks
`allowInsecureRequests` deprecated as a warning about HTTP; this reference uses
it intentionally only after strict loopback checks, so Astro reports one IDE
hint. An idle database connection failure
is reported and the pool can reconnect; no production availability is implied.

Startup acquires a PostgreSQL transaction lock and applies ordered, checksummed schema migrations transactionally. Its version and checksum are recorded in `draft_migrations`;
unknown history, changed migration contents or pre-existing unmanaged service
schemas cause startup to fail. Repeated startup verifies the recorded version.
This local mechanism does not replace production database privilege separation,
backup operations or operational controls. It does not attest live tables,
functions or triggers and does not detect out-of-band administrator changes to
those objects; future operational controls would be needed to detect such edits.

## Draft and recovery boundary

`POST /api/local/drafts` accepts a bounded ASCII request `key` and an embedded versioned
`recovery` object. Updates also require the server-owned `draftId` and
`expectedHead`. The request must have an authenticated session and the exact
configured Origin. The service authenticates before consuming the body, rejects
malformed UTF-8, and limits the body to the recovery codec's 80 MiB limit plus
2 KiB for its bounded wrapper. The envelope itself is limited by the codec.
The request is not a JSON string containing another serialized JSON document.

The server uses `decodeRecovery` to validate the entire creator backup and
pending-input envelope. It stores the canonical envelope and derives a frozen
materialization itself: materialized files are preserved as base64 bytes, while
incomplete drafts have a `blocked` result and read-only imports retain their
admitted files, exclusions and issues. Read-only metadata may contain malformed
UTF-8 and is preserved as bytes; malformed outer request UTF-8 is rejected. The
creator codec controls which metadata and auxiliary files are admitted, so
unknown scientific metadata is preserved. Selected image payload files and
browser `Blob` objects are not part of the recovery DTO. Frozen materialization
is not validation approval, submission readiness or archive acceptance.

The editor sends an expected-owner fingerprint with draft requests; the server
checks it against the authenticated session to reject an account change during
an operation. The fingerprint is a precondition, not authentication. Late
responses cannot replace a signed-out or changed principal, and edits after a
save immediately mark the displayed state unsaved.

The store allocates draft and revision IDs and hashes canonical recovery bytes.
It serializes requests per issuer/subject, records idempotency keys, rejects key
reuse with different input, and checks the expected head atomically. Immutable
revision rows retain both recovery and frozen materialization. A stale head or
idempotency conflict returns 409; a draft belonging to another identity returns
404. `GET /api/local/drafts/:id` returns the owner's current recovery, frozen result,
revision ID and server timestamp. Save responses identify the exact revision and
server timestamp, including when an idempotent request is replayed.
A losing client retains its unsaved input and can decide how to resolve the
conflict. No client-provided frozen files or readiness flag is accepted.

The local reference's HTTP contracts are not proposed BSS APIs. The editor can
sign in, list, save and reopen locally owned drafts. It keeps current work open
on conflict or session expiry and asks before replacing it. Before sending a
save, it records the exact snapshot and request key in IndexedDB; an uncertain
response is retried with the same key, including after reload. A rejected attempt
remains available to download as a backup or explicitly discard; it is never
removed merely because a retry failed. The conflict comparison shows bounded study, record, file and pending-input changes between the retained save, current work and the confirmed server revision, including its ID and timestamp. Complete backups contain metadata outside those summaries. Opening the confirmed revision or recovering the retained save requires confirmation and leaves the retained request available. Saving current work as a copy explicitly discards the retained request after confirmation; download its backup first if needed. Recovered work has no carried-over validation approval. If account save storage is unavailable,
the editor does not send an untracked save. Image files are not
part of the saved draft and must be selected again for validation.

To serve the local reference, run the built Astro server with
`HOST=127.0.0.1 PORT=14321 BIJUX_LOCAL_REFERENCE=1 node artifacts/web/dist/server/entry.mjs`.
Omitting the flag leaves its account endpoints unavailable.

Validation and package-candidate workflows require a separate local-account
matrix with store, browser, history-store, history-browser, reference-store and reference-browser lanes. The normal authoring gate owns the pure
account and recovery tests and strict server-source checks. The service lanes
use disposable PostgreSQL and Keycloak containers and are capped at five minutes
per lane; they do not qualify an external identity provider or deployment.


## Saved history

The local account view lists server-assigned version IDs and save times. Select
one or two versions to inspect their study titles and file listings. Version pages contain at most 100 revisions, and file, vocabulary and frozen-download lists show at most 50 entries at a time; older versions and all entries remain accessible through the page controls. Comparing two versions shows bounded study, record, file and pending-input changes; download both full backups for opaque or undisplayed metadata. Download a
historical recovery backup to retain the exact stored envelope. Frozen files are
offered separately from their stored bytes; blocked revisions have no frozen
files, and read-only revisions expose only their admitted files. The recovery
content hash identifies the backup payload and does not identify frozen bytes.

Restoring a version requires the current saved head and creates a new immutable
version. It does not alter the selected historical version. Conflicts leave the
current work open. Uncertain restore requests retain their key and source in
IndexedDB for retry, including after a reload. Restoring an editable version
replaces the current study only after confirmation, clears selected image files,
and requires validation again. The local account is a reference service, not
an archive or a production submission endpoint.

The local reference defaults to web port 14321, identity port 18080 and database
port 15433. To run isolated local instances, set `BIJUX_LOCAL_WEB_PORT`,
`BIJUX_LOCAL_IDENTITY_PORT` and `BIJUX_LOCAL_DATABASE_PORT` to numeric ports and
configure the local identity provider redirect and database to match. The web
server must use the same web port. All three service addresses remain loopback
addresses; these settings do not enable a remote service.

The destructive history-store tests require a dedicated disposable PostgreSQL
fixture at `127.0.0.1:15435` with database `history` and the fixture-only
credentials `postgres` / `history`. Set `HISTORY_DATABASE_URL` to
`postgresql://postgres:history@127.0.0.1:15435/history` and explicitly set
`BIJUX_HISTORY_DISPOSABLE=bijux-history-postgres` only after provisioning that
fixture. The tests drop their schemas; never point the fixture port at a database
containing work to preserve. Query-string and remote targets are rejected.

## Local reference submission fixture

The selected saved version can be sent only to an explicitly configured local
receiver fixture. Set `BIJUX_LOCAL_RECEIVER_PORT=14525` when starting Astro;
without it submission is unavailable. The destination is always
`http://127.0.0.1` at that port, with no credentials, redirects or remote
fallback. It is independent of BSS, DEV and production contracts. A local
receipt is not an archive accession and does not assert physical payload
presence or archive acceptance.

The fixture is owned by the local test suite and uses a separate disposable
PostgreSQL database. For an isolated local run, start the fixture database and
receiver in a separate terminal:

```sh
docker run -d --name bijuxreferencesubmission-receiver-db \
  --label bijux.fixture=reference-receiver-postgres \
  -e POSTGRES_PASSWORD=reference -e POSTGRES_DB=reference \
  -p 127.0.0.1:15441:5432 postgres:17.12@sha256:87c8b42f423b45d5247e6aa8fdb2e7762fec164c68a50fe3eb07e7bfcaf4dbcf
BIJUX_REFERENCE_DISPOSABLE=bijux-reference-postgres \
  REFERENCE_DATABASE_URL=postgresql://postgres:reference@127.0.0.1:15441/reference \
  npm run local:reference-receiver --workspace @bijux/ro-crate-web
```

The receiver accepts a JSON create of at most 24,000,000 encoded bytes with a durable `operationKey` and
ordered path/base64 metadata files. It hashes the exact request bytes, commits
one local receipt per key, returns the same receipt for the same bytes, and
returns 409 for the same key with different bytes. `GET /creates/:operationKey`
returns the committed receipt. Receiver state survives process and database
restarts. This protocol is a test fixture, not a proposal for an archive API.

Astro authenticates every operation using the session issuer and subject. The
request's owner value is only a precondition against a changed session. The
server qualifies the owned immutable version with default validation and
compares the qualification digest to the exact frozen bytes and checks the exact serialized receiver body limit before recording a
single durable operation for the draft. Different client keys for that version
coalesce. A changed version, digest or payload cannot replace it. Even a
conclusive rejection remains terminal: resetting or creating another logical
attempt for that draft is not supported. No operation is silently reset.

The operation starts prepared and is marked uncertain before transport, so a
crash or lost response cannot be reported as failure. A user retry sends the
same stored bytes and receiver key; only a verified local receipt establishes
acceptance. Unknown responses or unavailable transport leave the outcome
uncertain. A known acceptance is retained, and its last observed time is not
refreshed by an unavailable observation. The server does not poll in the
background. The local status response is available at
`GET /api/local/drafts/:draftId/submission`; submitting a selected version uses
`POST /api/local/drafts/:draftId/versions/:versionId/submission` with a request
key and owner precondition. These local contracts do not define a production
service.

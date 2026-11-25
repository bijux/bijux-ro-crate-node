# Local account and draft reference

This private, loopback-only reference combines Keycloak, PostgreSQL, the creator
recovery codec and Astro server routes. It prepares account and revision
contracts for local qualification. It is not a BSS, DEV or production identity,
storage or archive integration. The editor does not yet connect to this service.

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
their declared public package exports. The account controls remain disabled
when the local reference environment flag is absent.

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
credentials are not suitable for production. An idle database connection failure
is reported and the pool can reconnect; no production availability is implied.

Startup acquires a PostgreSQL transaction lock and applies the single owned schema
migration once. Its version and checksum are recorded in `draft_migrations`;
unknown history, changed migration contents or pre-existing unmanaged service
schemas cause startup to fail. Repeated startup verifies the recorded version.
This local mechanism does not replace production database privilege separation,
backup operations or operational controls.

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

The store allocates draft and revision IDs and hashes canonical recovery bytes.
It serializes requests per issuer/subject, records idempotency keys, rejects key
reuse with different input, and checks the expected head atomically. Immutable
revision rows retain both recovery and frozen materialization. A stale head or
idempotency conflict returns 409; a draft belonging to another identity returns
404. `GET /api/local/drafts/:id` returns the owner's current recovery and frozen result.
A losing client retains its unsaved input and can decide how to resolve the
conflict. No client-provided frozen files or readiness flag is accepted.

The local reference's HTTP contracts are not proposed BSS APIs. The editor still needs account controls and user-facing conflict handling; no
real account or remote save behavior is claimed here.

To serve the local reference, run the built Astro server with
`HOST=127.0.0.1 PORT=14321 BIJUX_LOCAL_REFERENCE=1 node artifacts/web/dist/server/entry.mjs`.
Omitting the flag leaves its account endpoints unavailable.

# Local draft store preparation

The PostgreSQL schema in `services/local-drafts/db` is a reference persistence
building block. It is not an account service or an integration with an archive.
The reference service offers a validator-gated local endpoint. Its application
adapter must validate the complete versioned creator backup and pending-input envelope,
exclude image payloads, and authenticate issuer and subject before invoking the
store. The envelope contract is still being developed; the store must not be
exposed to untrusted callers in the meantime.

The store allocates draft and revision IDs and hashes saved bytes. Its save
operation serializes requests per identity, records request keys, rejects key
reuse with different inputs, and checks the expected head while holding the
owner's draft row lock. Revision rows reject updates and deletes. This does not
replace database privilege separation or production operational controls.

The destructive integration test requires a dedicated PostgreSQL container whose
name begins `bijuxauthoring-accounts-test-`. It drops the `draft_store` schema
and restarts that container. Run only against disposable test data. Set
`DRAFT_TEST_POSTGRES` to the container name and run
`node --test services/local-drafts/tests/persistence.test.ts` with Docker on
`PATH`. The store test passed against both PostgreSQL 17.7 and the reference
PostgreSQL 17.12 image.

## Local identity reference

`services/local-drafts/reference/compose.yaml` runs Keycloak 26.8.2 and
PostgreSQL 17.12 together with loopback-only ports. The imported `authoring`
realm has two disposable research accounts and a public PKCE client. Its
credentials, HTTP issuer, fixed callback, and development-mode provider are
for local testing only. They do not represent a BSS, DEV or production identity
provider. The local identity session module, draft store and provider use the
same PostgreSQL service when the draft validator is configured.

Install the reference package's locked dependencies, then start the isolated
Compose project and run its identity check:

```sh
npm --prefix services/local-drafts ci
DockerComposeFile=services/local-drafts/reference/compose.yaml
docker compose -p bijuxauthoringaccounts -f "$DockerComposeFile" up -d
npm --prefix services/local-drafts run check
npm --prefix services/local-drafts run test:identity
npm --prefix services/local-drafts run test:session
```

Wait until the realm's discovery endpoint at
`http://127.0.0.1:18080/realms/authoring/.well-known/openid-configuration`
responds before testing. Playwright requires an installed Chromium browser.
`docker compose -p bijuxauthoringaccounts -f "$DockerComposeFile" down`
stops this project and preserves its named database volume; adding `-v`
deletes its local data. The imported realm is only applied to an empty database.
The identity test uses `openid-client` for discovery and authorization-code
exchange with PKCE, state and nonce, then checks distinct authenticated subjects.
A separate session test signs in both accounts, verifies distinct subjects and
logout isolation, restarts the identity service, and checks that sessions remain
usable. The draft integration check additionally exercises ownership, conditional
writes, idempotent retries, request bounds, PostgreSQL and application restarts,
and a fresh login after Keycloak restarts. Its validator is a synthetic test
fixture; it does not qualify the real creator recovery envelope or image exclusion.

References: [Keycloak container guide](https://www.keycloak.org/server/containers),
[Keycloak Docker guide](https://www.keycloak.org/getting-started/getting-started-docker),
and [openid-client documentation](https://github.com/panva/openid-client/tree/main/docs).

## Session boundary

`src/identity/server.ts` exposes an explicitly configured local service for the
reference realm. It accepts loopback HTTP issuer and origin URLs and a loopback
PostgreSQL URL only. Login uses authorization code, PKCE, state and nonce; the
session cookie contains a random token while PostgreSQL stores its hash, issuer,
subject and expiry. Logout requires the exact configured request origin. Session
schema setup runs on service startup. The module has no automatic startup or UI
integration, and its development-only HTTP cookies are not suitable for production.
It is not a BSS authentication interface.

## Draft API boundary

The service has no draft routes unless its caller explicitly provides
`validateDraft`. This trusted adapter must reject invalid input and return a
JSON serialization of the complete, versioned creator backup and pending-input
envelope. It must reject image payloads and preserve all pending work. No such
application adapter exists yet; the synthetic test validator is not suitable for
real authoring data. Until the recovery contract and adapter are completed and
tested, do not enable the draft routes in the editor. The recovery codec permits
up to 80 MiB, whereas this endpoint currently limits the entire request to 1 MiB;
the limits must be reconciled before integrating the adapter.

With a validator, `POST /drafts` accepts a request key and validated payload;
updates also carry the draft ID and expected head. It requires an authenticated
session and exact Origin, bounds request bodies to 1 MiB, and returns server IDs
and a SHA-256 hash. Conflicting head or key reuse returns 409, and a draft owned
by another identity returns 404. `GET /drafts/:id` returns only the owner's
current validated payload. These are local reference contracts, not BSS APIs.

The `test:drafts` check restarts the disposable Compose database and identity
containers. Set `DRAFT_REFERENCE_DATABASE_CONTAINER` to
`bijuxauthoringaccounts-database-1` and run it only against this isolated
reference project. In the tested setup, Keycloak required its own restart after
the database restart; the test does that before checking a fresh login.

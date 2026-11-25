# Local draft store preparation

The PostgreSQL schema in `services/local-drafts/db` is a reference persistence
building block. It is not an account service or an integration with an archive.
There is no network endpoint or login in this change. A future service must
validate the complete versioned creator backup and pending-input envelope,
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
provider. The local identity session module and the provider use the same
PostgreSQL service. Draft-store startup and the save API remain unimplemented.

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
usable. These checks do not test draft authorization or the save API.

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

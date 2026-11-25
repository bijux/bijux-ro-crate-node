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
`PATH`. The tested image was `postgres:17.7`; the reference deployment and its
maintained image pin remain to be selected when the service is completed.

# BSS interface observations

The authoring application can run without the BIA Submission System (BSS).
BSS remains responsible for accounts, permissions, submissions, transfer and
processing. The local reference service is a separate development fixture and
is not an implementation of these BSS routes.

The observations below come from a supplied BSS source snapshot, not a tested
or pinned deployment. They describe integration candidates, not a promise that
any target exposes the same contract. Before enabling an authenticated feature,
record the target's revision or image digest, API prefix, account role and date,
then verify the relevant behaviour against that target with disposable accounts.
Do not put credentials, tokens or real submission data in this repository.

Paths are relative to the BSS deployment's configured API prefix. The source
registers the submission list with a trailing slash and the create route without
one. Do not assume redirects preserve credentials or request bodies.

| Operation | Source observation | Evidence still required |
| --- | --- | --- |
| Health | `GET /health` returns an operational response. Development responses can include database status. | Reachability alone does not establish database or workflow readiness. |
| Sign in | `POST /auth/login/access-token` uses form credentials and returns access and refresh tokens. | Verify accepted identity forms, expiry, error handling and token protection in the target. |
| Refresh | `POST /auth/refresh` accepts a JSON refresh token and returns tokens. | Verify rotation, concurrent requests, revocation and account-change races before using automatic refresh. |
| Account detail | `GET /auth/users/{username}` returns a permitted user; privileged roles can read other users. | Prove the response belongs to the authenticated principal. A successful lookup alone is insufficient. |
| List submissions | `GET /submissions/` returns submissions visible to the caller. | Establish role visibility and an appropriate response bound; the observed list is not a pagination contract. |
| Submission detail | `GET /submissions/{id}` returns a hydrated record for an authorized caller. | Verify permission, missing-record and status behaviour without exposing unnecessary fields. |
| Create | `POST /submissions` accepts `submission_metadata` containing `title` and `release_date` and returns 201. | Verify target constraints and provisioning effects. A lost response is not evidence that creation failed. |
| Update summary | `PATCH /submissions/{id}` accepts `submission_metadata` with a title and/or release date. | Verify permitted states and concurrency with workflow transitions before enabling edits. |
| Deposit | `POST /submissions/{id}/deposit` returns 202 for an accepted deposit. | Verify prerequisites and role permissions. Accepted processing is not completed processing; do not blindly retry an uncertain request. |

For each qualified operation, retain a sanitized result describing the target,
role, request shape and observed success and denial. Confirm effective file
names, validation and transfer settings with the BSS owner. Until evidence is
available, use the existing BSS workflow for remote operations and keep local
Creator exports independent of remote state.

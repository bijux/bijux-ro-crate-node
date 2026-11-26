export const SUBMISSION_SCHEMA = `
CREATE TABLE draft_store.submissions (
  operation_id uuid PRIMARY KEY,
  draft_id uuid NOT NULL UNIQUE REFERENCES draft_store.drafts(id),
  version_id uuid NOT NULL REFERENCES draft_store.versions(id),
  content_hash text NOT NULL,
  qualification_digest text NOT NULL,
  payload text NOT NULL,
  state text NOT NULL DEFAULT 'prepared' CHECK (state IN ('prepared','uncertain','accepted','rejected')),
  receipt_id text,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  last_observed_at timestamptz,
  observation text NOT NULL DEFAULT 'none' CHECK (observation IN ('none','available','unavailable')),
  reason text
);
CREATE TABLE draft_store.submission_requests (
  issuer text NOT NULL, subject text NOT NULL, request_key text NOT NULL,
  operation_id uuid NOT NULL REFERENCES draft_store.submissions(operation_id),
  PRIMARY KEY (issuer, subject, request_key)
);
`;

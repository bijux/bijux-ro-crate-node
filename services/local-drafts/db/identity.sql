CREATE SCHEMA IF NOT EXISTS draft_identity;
CREATE TABLE IF NOT EXISTS draft_identity.sessions (
  token_hash text PRIMARY KEY,
  issuer text NOT NULL,
  subject text NOT NULL,
  expires_at timestamptz NOT NULL
);

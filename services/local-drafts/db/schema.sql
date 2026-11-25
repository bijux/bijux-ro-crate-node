-- The database is private to the reference service; callers must authenticate
-- and validate the versioned application envelope before using this interface.
CREATE SCHEMA IF NOT EXISTS draft_store;
CREATE TABLE IF NOT EXISTS draft_store.drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer text NOT NULL,
  subject text NOT NULL,
  head_id uuid
);
CREATE TABLE IF NOT EXISTS draft_store.versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL REFERENCES draft_store.drafts(id),
  payload text NOT NULL,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS draft_store.requests (
  issuer text NOT NULL,
  subject text NOT NULL,
  request_key text NOT NULL,
  requested_draft uuid,
  expected_head uuid,
  payload text NOT NULL,
  result_draft uuid NOT NULL REFERENCES draft_store.drafts(id),
  result_version uuid NOT NULL REFERENCES draft_store.versions(id),
  PRIMARY KEY (issuer, subject, request_key)
);
CREATE OR REPLACE FUNCTION draft_store.save(
  p_issuer text, p_subject text, p_draft uuid, p_head uuid, p_key text, p_payload text
) RETURNS TABLE (draft_id uuid, version_id uuid, content_hash text)
LANGUAGE plpgsql AS $$
DECLARE
  previous draft_store.requests%ROWTYPE;
  current_draft draft_store.drafts%ROWTYPE;
  new_draft uuid;
  new_version uuid;
  new_hash text;
BEGIN
  IF p_issuer IS NULL OR length(p_issuer) NOT BETWEEN 1 AND 2048 OR
     p_subject IS NULL OR length(p_subject) NOT BETWEEN 1 AND 512 OR
     p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 128 OR
     p_payload IS NULL OR octet_length(p_payload) > 1048576 THEN
    RAISE EXCEPTION 'invalid request';
  END IF;
  -- Serialize requests for an identity, including concurrent first saves.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_issuer || chr(31) || p_subject, 0));
  SELECT * INTO previous FROM draft_store.requests
    WHERE issuer = p_issuer AND subject = p_subject AND request_key = p_key;
  IF FOUND THEN
    IF previous.requested_draft IS DISTINCT FROM p_draft OR
       previous.expected_head IS DISTINCT FROM p_head OR previous.payload <> p_payload THEN
      RAISE EXCEPTION 'idempotency conflict';
    END IF;
    RETURN QUERY SELECT previous.result_draft, previous.result_version, v.content_hash
      FROM draft_store.versions v WHERE v.id = previous.result_version;
    RETURN;
  END IF;
  IF p_draft IS NULL THEN
    IF p_head IS NOT NULL THEN RAISE EXCEPTION 'invalid initial head'; END IF;
    INSERT INTO draft_store.drafts (issuer, subject) VALUES (p_issuer, p_subject)
      RETURNING id INTO new_draft;
  ELSE
    SELECT * INTO current_draft FROM draft_store.drafts d
      WHERE d.id = p_draft AND d.issuer = p_issuer AND d.subject = p_subject FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'draft unavailable'; END IF;
    IF current_draft.head_id IS DISTINCT FROM p_head THEN RAISE EXCEPTION 'head conflict'; END IF;
    new_draft := p_draft;
  END IF;
  new_hash := encode(sha256(convert_to(p_payload, 'UTF8')), 'hex');
  INSERT INTO draft_store.versions (draft_id, payload, content_hash)
    VALUES (new_draft, p_payload, new_hash) RETURNING id INTO new_version;
  UPDATE draft_store.drafts SET head_id = new_version WHERE id = new_draft;
  INSERT INTO draft_store.requests VALUES
    (p_issuer, p_subject, p_key, p_draft, p_head, p_payload, new_draft, new_version);
  RETURN QUERY SELECT new_draft, new_version, new_hash;
END $$;

CREATE OR REPLACE FUNCTION draft_store.reject_version_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'versions are immutable';
END $$;
DROP TRIGGER IF EXISTS immutable_versions ON draft_store.versions;
CREATE TRIGGER immutable_versions BEFORE UPDATE OR DELETE ON draft_store.versions
FOR EACH ROW EXECUTE FUNCTION draft_store.reject_version_mutation();

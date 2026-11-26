export const HISTORY_SCHEMA = `
ALTER TABLE draft_store.requests ADD COLUMN operation text NOT NULL DEFAULT 'save';
ALTER TABLE draft_store.requests ADD COLUMN source_version uuid REFERENCES draft_store.versions(id);
ALTER FUNCTION draft_store.save(text, text, uuid, uuid, text, text, jsonb) RENAME TO save_original;
CREATE FUNCTION draft_store.save(p_issuer text, p_subject text, p_draft uuid, p_head uuid, p_key text, p_payload text, p_frozen jsonb)
RETURNS TABLE (draft_id uuid, version_id uuid, content_hash text) LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_issuer || chr(31) || p_subject, 0));
  IF EXISTS (SELECT 1 FROM draft_store.requests WHERE issuer = p_issuer AND subject = p_subject AND request_key = p_key AND operation <> 'save') THEN
    RAISE EXCEPTION 'idempotency conflict';
  END IF;
  RETURN QUERY SELECT * FROM draft_store.save_original(p_issuer, p_subject, p_draft, p_head, p_key, p_payload, p_frozen);
END $$;
CREATE FUNCTION draft_store.restore(p_issuer text, p_subject text, p_draft uuid, p_head uuid, p_key text, p_source uuid)
RETURNS TABLE (draft_id uuid, version_id uuid, content_hash text) LANGUAGE plpgsql AS $$
DECLARE previous draft_store.requests%ROWTYPE; current_draft draft_store.drafts%ROWTYPE;
  source draft_store.versions%ROWTYPE; new_version uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_issuer || chr(31) || p_subject, 0));
  SELECT * INTO previous FROM draft_store.requests WHERE issuer = p_issuer AND subject = p_subject AND request_key = p_key;
  IF FOUND THEN
    IF previous.operation <> 'restore' OR previous.requested_draft IS DISTINCT FROM p_draft OR
       previous.expected_head IS DISTINCT FROM p_head OR previous.source_version IS DISTINCT FROM p_source THEN
      RAISE EXCEPTION 'idempotency conflict';
    END IF;
    RETURN QUERY SELECT previous.result_draft, previous.result_version, v.content_hash FROM draft_store.versions v WHERE v.id = previous.result_version;
    RETURN;
  END IF;
  SELECT * INTO current_draft FROM draft_store.drafts d WHERE d.id = p_draft AND d.issuer = p_issuer AND d.subject = p_subject FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'draft unavailable'; END IF;
  SELECT * INTO source FROM draft_store.versions v WHERE v.id = p_source AND v.draft_id = p_draft;
  IF NOT FOUND THEN RAISE EXCEPTION 'draft unavailable'; END IF;
  IF current_draft.head_id IS DISTINCT FROM p_head THEN RAISE EXCEPTION 'head conflict'; END IF;
  INSERT INTO draft_store.versions (draft_id, payload, frozen, content_hash) VALUES (p_draft, source.payload, source.frozen, source.content_hash) RETURNING id INTO new_version;
  UPDATE draft_store.drafts SET head_id = new_version WHERE id = p_draft;
  INSERT INTO draft_store.requests (issuer, subject, request_key, requested_draft, expected_head, payload, result_draft, result_version, operation, source_version)
    VALUES (p_issuer, p_subject, p_key, p_draft, p_head, source.payload, p_draft, new_version, 'restore', p_source);
  RETURN QUERY SELECT p_draft, new_version, source.content_hash;
END $$;
`;

/** Older sessions have no display hint and remain valid. */
export const IDENTITY_LABEL_SCHEMA = `ALTER TABLE draft_identity.sessions ADD COLUMN preferred_username text;`

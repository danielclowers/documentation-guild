ALTER TABLE invitations ADD COLUMN reserved_username TEXT;

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  actor_member_id TEXT NOT NULL REFERENCES members (id),
  action TEXT NOT NULL,
  object_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX audit_log_created ON audit_log (created_at DESC, id DESC);

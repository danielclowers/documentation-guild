CREATE TABLE account_recovery (
  id TEXT PRIMARY KEY NOT NULL,
  member_id TEXT NOT NULL REFERENCES members (id),
  issued_by TEXT NOT NULL REFERENCES members (id),
  token_hash TEXT NOT NULL UNIQUE
    CHECK (length(token_hash) = 64 AND token_hash NOT GLOB '*[^0-9a-f]*'),
  expires_at INTEGER NOT NULL,
  used_at INTEGER
) STRICT;

CREATE INDEX account_recovery_member ON account_recovery (member_id, used_at);

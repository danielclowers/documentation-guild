CREATE TABLE guilds (
  id TEXT PRIMARY KEY NOT NULL CHECK (id = 'documentation-guild'),
  name TEXT NOT NULL,
  renown INTEGER NOT NULL DEFAULT 0 CHECK (renown >= 0)
) STRICT;

INSERT INTO guilds (id, name) VALUES ('documentation-guild', 'The Documentation Guild');

CREATE TABLE members (
  id TEXT PRIMARY KEY NOT NULL,
  guild_id TEXT NOT NULL REFERENCES guilds (id),
  clerk_user_id TEXT NOT NULL UNIQUE,
  auth_username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended')),
  joined_at INTEGER NOT NULL
) STRICT;

CREATE TABLE invitations (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL UNIQUE
    CHECK (length(token_hash) = 64 AND token_hash NOT GLOB '*[^0-9a-f]*'),
  issued_by TEXT NOT NULL REFERENCES members (id),
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK (expires_at > issued_at),
  status TEXT NOT NULL DEFAULT 'issued'
    CHECK (status IN ('issued', 'pending', 'consumed', 'revoked')),
  redemption_key TEXT UNIQUE,
  pending_until INTEGER,
  redeemed_member_id TEXT UNIQUE REFERENCES members (id),
  used_at INTEGER,
  revoked_at INTEGER,
  CHECK ((status = 'pending') = (pending_until IS NOT NULL)),
  CHECK (status NOT IN ('pending', 'consumed') OR redemption_key IS NOT NULL),
  CHECK ((status = 'consumed') = (used_at IS NOT NULL)),
  CHECK ((status = 'consumed') = (redeemed_member_id IS NOT NULL)),
  CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
) STRICT;

CREATE INDEX invitations_status_expiry ON invitations (status, expires_at);

CREATE TABLE characters (
  id TEXT PRIMARY KEY NOT NULL,
  member_id TEXT NOT NULL UNIQUE REFERENCES members (id),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 2 AND 24),
  hair_style INTEGER NOT NULL CHECK (hair_style BETWEEN 0 AND 2),
  hair_color INTEGER NOT NULL CHECK (hair_color BETWEEN 0 AND 4),
  tunic_color INTEGER NOT NULL CHECK (tunic_color BETWEEN 0 AND 4),
  total_xp INTEGER NOT NULL DEFAULT 0 CHECK (total_xp BETWEEN 0 AND 9007199254740991),
  gold INTEGER NOT NULL DEFAULT 0 CHECK (gold BETWEEN 0 AND 9007199254740991),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0)
) STRICT;

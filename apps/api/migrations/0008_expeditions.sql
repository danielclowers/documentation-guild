CREATE TABLE expedition_parties (
  id TEXT PRIMARY KEY,
  mission TEXT NOT NULL,
  chapter TEXT NOT NULL,
  leader_id TEXT NOT NULL REFERENCES members(id),
  leader_since INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('recruiting','grace','running','completed','cancelled','expired','failed')),
  seed INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  scheduled_at INTEGER,
  grace_until INTEGER,
  started_at INTEGER,
  ends_at INTEGER,
  closed_at INTEGER,
  resolved_by TEXT,
  baseline_renown INTEGER NOT NULL DEFAULT 0,
  shared_bonus INTEGER NOT NULL DEFAULT 0,
  shared_discovery INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE INDEX expeditions_due ON expedition_parties(state, scheduled_at, grace_until, ends_at);

CREATE TABLE expedition_members (
  party_id TEXT NOT NULL REFERENCES expedition_parties(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  character_id TEXT NOT NULL REFERENCES characters(id),
  role TEXT NOT NULL CHECK (role IN ('Scribing','Research','Restoration')),
  approach TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  released_at INTEGER,
  snapshot TEXT,
  PRIMARY KEY (party_id, member_id)
) STRICT;

CREATE UNIQUE INDEX expedition_commitment ON expedition_members(member_id) WHERE released_at IS NULL;
CREATE INDEX expedition_character ON expedition_members(character_id, party_id);

CREATE TABLE expedition_events (
  party_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  slot INTEGER NOT NULL CHECK (slot BETWEEN 0 AND 1),
  option_id TEXT NOT NULL,
  success INTEGER NOT NULL CHECK (success IN (0,1)),
  renown INTEGER NOT NULL,
  resolved_at INTEGER NOT NULL,
  resolution_id TEXT NOT NULL UNIQUE,
  retried INTEGER NOT NULL DEFAULT 0 CHECK (retried IN (0,1)),
  PRIMARY KEY (party_id, member_id, slot),
  FOREIGN KEY (party_id, member_id) REFERENCES expedition_members(party_id, member_id)
) STRICT;

CREATE TABLE expedition_chronicle (
  clue TEXT PRIMARY KEY,
  chapter TEXT NOT NULL,
  party_id TEXT NOT NULL REFERENCES expedition_parties(id)
) STRICT;

CREATE TABLE expedition_invites (
  party_id TEXT NOT NULL REFERENCES expedition_parties(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  PRIMARY KEY (party_id, member_id)
) STRICT;

CREATE TABLE business_cases (
  id TEXT PRIMARY KEY NOT NULL,
  character_id TEXT NOT NULL REFERENCES characters (id),
  position INTEGER NOT NULL CHECK (position >= 0),
  template_key TEXT NOT NULL,
  seed INTEGER NOT NULL CHECK (seed BETWEEN 0 AND 4294967295),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  retry_at INTEGER NOT NULL DEFAULT 0,
  completed_at INTEGER,
  outcome_key TEXT,
  resolution_id TEXT,
  renown INTEGER NOT NULL DEFAULT 0 CHECK (renown BETWEEN 0 AND 5),
  UNIQUE (character_id, position)
) STRICT;

CREATE INDEX business_pending ON business_cases (character_id, completed_at, position);

CREATE TABLE personal_discoveries (
  character_id TEXT NOT NULL REFERENCES characters (id),
  discovery_key TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  discovered_at INTEGER NOT NULL,
  PRIMARY KEY (character_id, discovery_key)
) STRICT;

CREATE INDEX personal_discoveries_source ON personal_discoveries (character_id, source_type, source_id);

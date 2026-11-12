CREATE TABLE standing_orders (
  character_id TEXT PRIMARY KEY NOT NULL REFERENCES characters (id),
  skill TEXT NOT NULL CHECK (skill IN ('Scribing', 'Research', 'Restoration')),
  accounted_at INTEGER NOT NULL,
  offline_ms INTEGER NOT NULL DEFAULT 0 CHECK (offline_ms BETWEEN 0 AND 86400000),
  scribing_ms INTEGER NOT NULL DEFAULT 0 CHECK (scribing_ms BETWEEN 0 AND 299999),
  research_ms INTEGER NOT NULL DEFAULT 0 CHECK (research_ms BETWEEN 0 AND 299999),
  restoration_ms INTEGER NOT NULL DEFAULT 0 CHECK (restoration_ms BETWEEN 0 AND 299999),
  suspended_at INTEGER,
  version INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE character_skills (
  character_id TEXT NOT NULL REFERENCES characters (id),
  skill TEXT NOT NULL CHECK (skill IN ('Scribing', 'Research', 'Restoration')),
  xp INTEGER NOT NULL DEFAULT 0 CHECK (xp BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY (character_id, skill)
) STRICT;

CREATE TABLE reward_ledger (
  character_id TEXT NOT NULL REFERENCES characters (id),
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  skill TEXT NOT NULL CHECK (skill IN ('Scribing', 'Research', 'Restoration')),
  xp INTEGER NOT NULL CHECK (xp >= 0),
  skill_xp INTEGER NOT NULL CHECK (skill_xp >= 0),
  gold INTEGER NOT NULL CHECK (gold >= 0),
  awarded_at INTEGER NOT NULL,
  PRIMARY KEY (character_id, source_type, source_id)
) STRICT;

CREATE INDEX reward_ledger_recent ON reward_ledger (character_id, source_type, awarded_at DESC);

CREATE TRIGGER apply_character_reward AFTER INSERT ON reward_ledger
BEGIN
  UPDATE characters SET total_xp = total_xp + NEW.xp, gold = gold + NEW.gold WHERE id = NEW.character_id;
  INSERT INTO character_skills (character_id, skill, xp) VALUES (NEW.character_id, NEW.skill, NEW.skill_xp)
    ON CONFLICT (character_id, skill) DO UPDATE SET xp = xp + excluded.xp;
END;

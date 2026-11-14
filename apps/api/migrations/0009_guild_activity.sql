CREATE INDEX expedition_returns ON expedition_parties(ends_at DESC, id) WHERE state = 'completed';

CREATE INDEX expedition_discovery_returns ON expedition_parties(ends_at DESC, id)
  WHERE state = 'completed' AND shared_discovery = 1;

CREATE TABLE guild_renown_milestones (
  renown INTEGER PRIMARY KEY CHECK (renown > 0),
  reached_at INTEGER NOT NULL
) STRICT;

CREATE TRIGGER record_guild_renown_milestone AFTER UPDATE OF renown ON guilds
WHEN NEW.renown > OLD.renown
BEGIN
  INSERT OR IGNORE INTO guild_renown_milestones (renown, reached_at)
  SELECT value, CAST(unixepoch('subsec') * 1000 AS INTEGER)
  FROM json_each('[100,300,700,1500,3000,7000,15000]')
  WHERE value > OLD.renown AND value <= NEW.renown;
END;

ALTER TABLE expedition_parties ADD COLUMN shared_discovered_at INTEGER;

ALTER TABLE expedition_parties ADD COLUMN modifier TEXT;

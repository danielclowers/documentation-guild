ALTER TABLE characters ADD COLUMN specialization TEXT
  CHECK (specialization IN ('Chronicler', 'Editor', 'Archivist', 'Investigator', 'Mender', 'Warden'));

ALTER TABLE characters ADD COLUMN specialization_switched_at INTEGER;

CREATE TABLE training_purchases (
  character_id TEXT NOT NULL REFERENCES characters (id),
  upgrade_key TEXT NOT NULL CHECK (upgrade_key IN ('efficient_scribing', 'careful_research', 'expedition_readiness', 'steady_hands')),
  rank INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 3),
  PRIMARY KEY (character_id, upgrade_key)
) STRICT;

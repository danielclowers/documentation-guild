ALTER TABLE characters ADD COLUMN tutorial_status TEXT CHECK (tutorial_status IN ('pending','done'));

ALTER TABLE business_cases ADD COLUMN discovery_roll_key TEXT;

ALTER TABLE business_cases ADD COLUMN chosen_option INTEGER;

ALTER TABLE expedition_events ADD COLUMN discovery_roll_key TEXT;

CREATE INDEX business_recent_templates ON business_cases (character_id, completed_at DESC, position DESC)
  WHERE completed_at IS NOT NULL;

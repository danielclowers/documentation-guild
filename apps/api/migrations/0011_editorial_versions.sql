-- Existing records retain the wording used when their puzzles and choices were created.
ALTER TABLE business_cases ADD COLUMN content_version INTEGER NOT NULL DEFAULT 1 CHECK (content_version IN (1, 2));
ALTER TABLE expedition_parties ADD COLUMN content_version INTEGER NOT NULL DEFAULT 1 CHECK (content_version IN (1, 2));

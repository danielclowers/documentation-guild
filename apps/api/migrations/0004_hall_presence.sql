ALTER TABLE characters ADD COLUMN hall_station TEXT NOT NULL DEFAULT 'Lounge'
  CHECK (hall_station IN ('Lounge', 'Scriptorium', 'Archives', 'Restoration Table'));
ALTER TABLE characters ADD COLUMN hall_station_at INTEGER NOT NULL DEFAULT 0;

CREATE TABLE hall_tickets (
  token_hash TEXT PRIMARY KEY NOT NULL,
  member_id TEXT NOT NULL REFERENCES members (id),
  origin TEXT NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT;

CREATE INDEX hall_ticket_expiry ON hall_tickets (expires_at);

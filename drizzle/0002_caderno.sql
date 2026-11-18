CREATE TABLE writing_reservations (
  plant_id INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  sent_at INTEGER,
  author_name TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX letter_submissions_plant ON letter_submissions (plant_id);

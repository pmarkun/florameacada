CREATE TABLE letter_submissions (
  id TEXT PRIMARY KEY,
  plant_id INTEGER NOT NULL,
  author_name TEXT NOT NULL,
  author_email TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  published_at INTEGER
);
--> statement-breakpoint
CREATE UNIQUE INDEX letter_published_per_plant ON letter_submissions (plant_id)
WHERE published_at IS NOT NULL;
--> statement-breakpoint
CREATE INDEX letter_queue ON letter_submissions (published_at, created_at, id);
--> statement-breakpoint
CREATE TABLE moderation_credentials (
  email TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE moderation_sessions (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

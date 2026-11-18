CREATE TABLE reservations (
  plant_id INTEGER PRIMARY KEY,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  sent_at INTEGER
);
--> statement-breakpoint
CREATE INDEX reservations_email ON reservations (email, expires_at);
--> statement-breakpoint
CREATE TABLE letters (
  plant_id INTEGER PRIMARY KEY,
  message_id TEXT NOT NULL UNIQUE,
  body TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  published_at INTEGER,
  author_name TEXT,
  FOREIGN KEY (plant_id) REFERENCES reservations (plant_id)
);
--> statement-breakpoint
CREATE TABLE mail_limits (
  bucket TEXT PRIMARY KEY,
  window_end INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);

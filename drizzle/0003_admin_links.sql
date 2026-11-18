CREATE TABLE moderation_admins (
  email TEXT PRIMARY KEY,
  added_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE moderation_login_links (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX moderation_login_links_expiry ON moderation_login_links (expires_at);

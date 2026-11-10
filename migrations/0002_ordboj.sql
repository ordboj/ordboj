CREATE TABLE user_progress (
  user_id TEXT PRIMARY KEY,
  blob TEXT NOT NULL,
  revision INTEGER NOT NULL,
  resetEpoch INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE mail_counter (
  scope TEXT NOT NULL,
  subject TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (scope, subject)
);

CREATE TABLE mail_token (
  token_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

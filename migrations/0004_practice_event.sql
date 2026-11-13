-- First-party practice events after sign-in.
-- Snake_case and ISO TEXT timestamps, same as 0002_ordboj.sql.
-- Better Auth tables stay camelCase. Do not mix those conventions here.
-- Per-verb difficulty is out of scope. This table does not store one.
-- Rows are deleted with the account (ON DELETE CASCADE) and after 13 months.

CREATE TABLE practice_event (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  round_id TEXT NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('practice_start','answer','practice_complete')),
  occurred_at TEXT NOT NULL,
  surface TEXT NOT NULL CHECK (surface IN ('conjugation','particle')),
  session_kind TEXT CHECK (session_kind IN ('due','extra','free')),
  practice_mode TEXT CHECK (practice_mode IN ('typing','multiple-choice')),
  modality TEXT CHECK (modality IN ('typed','choice')),
  form TEXT CHECK (form IN ('infinitive','presens','preteritum','supinum','imperativ')),
  particle_kind TEXT CHECK (particle_kind IN ('cloze','recall')),
  correct INTEGER CHECK (correct IN (0,1)),
  was_new INTEGER CHECK (was_new IN (0,1)),
  is_requeue INTEGER CHECK (is_requeue IN (0,1)),
  item_count INTEGER, correct_count INTEGER, duration_ms INTEGER
);
CREATE INDEX practice_event_user_time_idx ON practice_event (user_id, occurred_at);
CREATE INDEX practice_event_event_time_idx ON practice_event (event, occurred_at);

-- Account-level objection. No row means the account has not objected.
-- Settings writes opted_out = 1. That stops new rows and deletes the old ones.
CREATE TABLE practice_event_opt_out (
  user_id TEXT PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  opted_out INTEGER NOT NULL CHECK (opted_out IN (0,1)),
  updated_at TEXT NOT NULL
);

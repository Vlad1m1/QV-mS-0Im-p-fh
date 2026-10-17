PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS authors (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS experiments (
 id INTEGER PRIMARY KEY, title TEXT NOT NULL, objective TEXT NOT NULL, date TEXT NOT NULL,
 author_id INTEGER NOT NULL REFERENCES authors(id), created_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
 number INTEGER NOT NULL, work_mode TEXT NOT NULL DEFAULT 'solo' CHECK(work_mode IN ('solo','shared'))
);
CREATE TABLE IF NOT EXISTS experiment_members (
 experiment_id INTEGER NOT NULL REFERENCES experiments(id),
 author_id INTEGER NOT NULL REFERENCES authors(id),
 PRIMARY KEY(experiment_id, author_id)
);
CREATE INDEX IF NOT EXISTS idx_members_author ON experiment_members(author_id,experiment_id);
CREATE TABLE IF NOT EXISTS experiment_sequences (
 author_id INTEGER PRIMARY KEY REFERENCES authors(id), next_number INTEGER NOT NULL CHECK(next_number>0)
);
CREATE TABLE IF NOT EXISTS attempts (
 id INTEGER PRIMARY KEY, experiment_id INTEGER NOT NULL REFERENCES experiments(id),
 number INTEGER NOT NULL, author_id INTEGER NOT NULL REFERENCES authors(id), created_at TEXT NOT NULL,
 UNIQUE(experiment_id, number)
);
CREATE TABLE IF NOT EXISTS attempt_versions (
 id INTEGER PRIMARY KEY, attempt_id INTEGER NOT NULL REFERENCES attempts(id), version INTEGER NOT NULL,
 result_name TEXT NOT NULL, result_value TEXT NOT NULL, result_unit TEXT NOT NULL, note TEXT NOT NULL,
 author_id INTEGER NOT NULL REFERENCES authors(id), created_at TEXT NOT NULL, reason TEXT NOT NULL,
 UNIQUE(attempt_id, version)
);
CREATE TABLE IF NOT EXISTS measurements (
 id INTEGER PRIMARY KEY, version_id INTEGER NOT NULL REFERENCES attempt_versions(id),
 position INTEGER NOT NULL, name TEXT NOT NULL, value TEXT NOT NULL, unit TEXT NOT NULL,
 UNIQUE(version_id, position)
);
CREATE TABLE IF NOT EXISTS events (
 id INTEGER PRIMARY KEY, experiment_id INTEGER NOT NULL REFERENCES experiments(id),
 attempt_id INTEGER REFERENCES attempts(id), kind TEXT NOT NULL,
 author_id INTEGER NOT NULL REFERENCES authors(id), created_at TEXT NOT NULL,
 content TEXT NOT NULL, before_json TEXT, after_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_attempt_experiment ON attempts(experiment_id);
CREATE INDEX IF NOT EXISTS idx_version_attempt ON attempt_versions(attempt_id, version);
CREATE INDEX IF NOT EXISTS idx_event_experiment ON events(experiment_id, id);
CREATE TRIGGER IF NOT EXISTS immutable_versions_update BEFORE UPDATE ON attempt_versions BEGIN SELECT RAISE(ABORT, 'Versions are immutable'); END;
CREATE TRIGGER IF NOT EXISTS immutable_versions_delete BEFORE DELETE ON attempt_versions BEGIN SELECT RAISE(ABORT, 'Versions are immutable'); END;
CREATE TRIGGER IF NOT EXISTS immutable_measurements_update BEFORE UPDATE ON measurements BEGIN SELECT RAISE(ABORT, 'Measurements are immutable'); END;
CREATE TRIGGER IF NOT EXISTS immutable_measurements_delete BEFORE DELETE ON measurements BEGIN SELECT RAISE(ABORT, 'Measurements are immutable'); END;
CREATE TRIGGER IF NOT EXISTS immutable_events_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT, 'History is immutable'); END;
CREATE TRIGGER IF NOT EXISTS immutable_events_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT, 'History is immutable'); END;

-- Accounts are separate from historical author identities. Existing authors are
-- linked only by the local administrator; signup always creates a fresh author.
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY, author_id INTEGER NOT NULL UNIQUE REFERENCES authors(id),
 email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 csrf_token TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS auth_rate_limits (
 bucket TEXT PRIMARY KEY, window_start INTEGER NOT NULL, attempts INTEGER NOT NULL
);

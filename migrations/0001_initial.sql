CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY CHECK (id = 'default'),
  language TEXT NOT NULL DEFAULT 'Spanish',
  voice TEXT NOT NULL DEFAULT '',
  speed REAL NOT NULL DEFAULT 1,
  subject TEXT NOT NULL DEFAULT 'Historical Events',
  level TEXT NOT NULL DEFAULT 'A1 (Beginner)',
  vocab_words_count INTEGER NOT NULL DEFAULT 3,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO settings (id) VALUES ('default');

CREATE TABLE IF NOT EXISTS vocabulary (
  id TEXT PRIMARY KEY,
  word TEXT NOT NULL UNIQUE,
  mastery TEXT NOT NULL DEFAULT 'new',
  occurrences INTEGER NOT NULL DEFAULT 1,
  last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  contexts_json TEXT NOT NULL DEFAULT '[]',
  forms_json TEXT NOT NULL DEFAULT '[]',
  target_language TEXT NOT NULL DEFAULT 'Spanish',
  translation TEXT NOT NULL DEFAULT '',
  examples_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vocabulary_mastery_last_seen
  ON vocabulary (mastery, last_seen);

CREATE INDEX IF NOT EXISTS idx_vocabulary_target_language
  ON vocabulary (target_language);

CREATE TABLE IF NOT EXISTS history (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  related_topics_json TEXT NOT NULL DEFAULT '[]',
  show_topics INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_history_created_at
  ON history (created_at);

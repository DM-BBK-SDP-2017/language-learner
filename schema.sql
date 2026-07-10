CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY CHECK (id = 'default'),
  language TEXT NOT NULL DEFAULT 'Spanish',
  voice TEXT NOT NULL DEFAULT '',
  speed REAL NOT NULL DEFAULT 1,
  subject TEXT NOT NULL DEFAULT 'Historical Events',
  level TEXT NOT NULL DEFAULT 'A1 (Beginner)',
  vocab_words_count INTEGER NOT NULL DEFAULT 3,
  vocabulary_mix INTEGER NOT NULL DEFAULT 50,
  quiz_option_count INTEGER NOT NULL DEFAULT 8,
  listening_new_learning_percent INTEGER NOT NULL DEFAULT 85,
  listening_batch_size INTEGER NOT NULL DEFAULT 8,
  listening_playback_speed REAL NOT NULL DEFAULT 1,
  listening_repetitions INTEGER NOT NULL DEFAULT 1,
  listening_gap_seconds REAL NOT NULL DEFAULT 1.5,
  listening_autoplay_phrase_limit INTEGER NOT NULL DEFAULT 10,
  listening_show_sentence INTEGER NOT NULL DEFAULT 0,
  listening_random_order INTEGER NOT NULL DEFAULT 1,
  new_to_learning_seen_threshold INTEGER NOT NULL DEFAULT 3,
  learning_to_known_success_threshold INTEGER NOT NULL DEFAULT 5,
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
  listen_count INTEGER NOT NULL DEFAULT 0,
  mnemonic TEXT NOT NULL DEFAULT '',
  image_json TEXT NOT NULL DEFAULT '{}',
  review_seen_count INTEGER NOT NULL DEFAULT 0,
  review_success_count INTEGER NOT NULL DEFAULT 0,
  examples_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vocabulary_mastery_last_seen
  ON vocabulary (mastery, last_seen);

CREATE INDEX IF NOT EXISTS idx_vocabulary_target_language
  ON vocabulary (target_language);

CREATE TABLE IF NOT EXISTS image_jobs (
  id TEXT PRIMARY KEY,
  vocabulary_id TEXT NOT NULL,
  word TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  prompt_json TEXT NOT NULL DEFAULT '{}',
  prompt_text TEXT NOT NULL DEFAULT '',
  r2_key TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT NOT NULL DEFAULT '',
  finished_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_image_jobs_vocabulary_status_created_at
  ON image_jobs (vocabulary_id, status, created_at);

CREATE TABLE IF NOT EXISTS history (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  related_topics_json TEXT NOT NULL DEFAULT '[]',
  show_topics INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_history_created_at
  ON history (created_at);

CREATE TABLE IF NOT EXISTS listening_sentences (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  language TEXT NOT NULL,
  text TEXT NOT NULL,
  vocabulary_json TEXT NOT NULL DEFAULT '[]',
  voice_id TEXT NOT NULL,
  voice_name TEXT NOT NULL DEFAULT '',
  translation TEXT NOT NULL DEFAULT '',
  audio_r2_key TEXT NOT NULL,
  audio_content_type TEXT NOT NULL DEFAULT 'audio/mpeg',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_listening_sentences_language_created_at
  ON listening_sentences (language, created_at);

CREATE TABLE IF NOT EXISTS elevenlabs_voice_cache (
  language TEXT PRIMARY KEY,
  voices_json TEXT NOT NULL DEFAULT '[]',
  refreshed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE settings ADD COLUMN listening_new_learning_percent INTEGER NOT NULL DEFAULT 85;
ALTER TABLE settings ADD COLUMN listening_batch_size INTEGER NOT NULL DEFAULT 8;

CREATE TABLE IF NOT EXISTS listening_sentences (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  language TEXT NOT NULL,
  text TEXT NOT NULL,
  vocabulary_json TEXT NOT NULL DEFAULT '[]',
  voice_id TEXT NOT NULL,
  voice_name TEXT NOT NULL DEFAULT '',
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

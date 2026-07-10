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

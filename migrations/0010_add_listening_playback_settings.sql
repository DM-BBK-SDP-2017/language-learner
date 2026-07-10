ALTER TABLE settings ADD COLUMN listening_playback_speed REAL NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN listening_repetitions INTEGER NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN listening_gap_seconds REAL NOT NULL DEFAULT 1.5;
ALTER TABLE settings ADD COLUMN listening_autoplay_phrase_limit INTEGER NOT NULL DEFAULT 10;

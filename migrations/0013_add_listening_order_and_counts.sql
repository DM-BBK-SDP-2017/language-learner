ALTER TABLE settings ADD COLUMN listening_random_order INTEGER NOT NULL DEFAULT 1;
ALTER TABLE listening_sentences ADD COLUMN listen_count INTEGER NOT NULL DEFAULT 0;

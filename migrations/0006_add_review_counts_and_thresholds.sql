ALTER TABLE vocabulary ADD COLUMN review_seen_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE vocabulary ADD COLUMN review_success_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN new_to_learning_seen_threshold INTEGER NOT NULL DEFAULT 3;
ALTER TABLE settings ADD COLUMN learning_to_known_success_threshold INTEGER NOT NULL DEFAULT 5;

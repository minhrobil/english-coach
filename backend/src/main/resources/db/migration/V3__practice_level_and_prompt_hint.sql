ALTER TABLE user_setting
    ADD COLUMN IF NOT EXISTS practice_level VARCHAR(20) NOT NULL DEFAULT 'medium';


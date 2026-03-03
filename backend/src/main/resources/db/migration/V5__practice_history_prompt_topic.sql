ALTER TABLE practice_history
    ADD COLUMN IF NOT EXISTS prompt_topic VARCHAR(120);

UPDATE practice_history ph
SET prompt_topic = us.practice_topic
FROM user_setting us
WHERE ph.user_email = us.user_email
  AND (ph.prompt_topic IS NULL OR ph.prompt_topic = '');

UPDATE practice_history
SET prompt_topic = 'work'
WHERE prompt_topic IS NULL OR prompt_topic = '';

CREATE INDEX IF NOT EXISTS idx_practice_history_user_topic_submitted_at
    ON practice_history (user_email, prompt_topic, submitted_at DESC);

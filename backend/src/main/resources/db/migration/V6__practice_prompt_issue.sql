CREATE TABLE IF NOT EXISTS practice_prompt_issue (
    prompt_id UUID PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL,
    prompt_topic VARCHAR(120) NOT NULL,
    prompt_level VARCHAR(40) NOT NULL,
    issued_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_practice_prompt_issue_user_issued_at
    ON practice_prompt_issue (user_email, issued_at DESC);

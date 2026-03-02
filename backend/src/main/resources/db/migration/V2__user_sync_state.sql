CREATE TABLE IF NOT EXISTS user_setting (
    user_email VARCHAR(255) PRIMARY KEY,
    backend_base_url VARCHAR(512) NOT NULL DEFAULT 'http://localhost:8088',
    periodic_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    periodic_interval_seconds INT NOT NULL DEFAULT 45,
    answer_mode VARCHAR(40) NOT NULL DEFAULT 'MULTIPLE_CHOICE',
    practice_topic VARCHAR(120) NOT NULL DEFAULT 'work',
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS practice_history (
    answer_id UUID PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL,
    prompt_id UUID NOT NULL,
    source_sentence TEXT NOT NULL,
    reference_answer TEXT NOT NULL,
    user_answer TEXT NOT NULL,
    overall_score INT NOT NULL,
    grammar_score INT NOT NULL,
    naturalness_score INT NOT NULL,
    vocabulary_score INT NOT NULL,
    explanation TEXT,
    better_phrasing TEXT,
    vocabulary_hints_json TEXT,
    evaluation_status VARCHAR(40) NOT NULL,
    highlighted BOOLEAN NOT NULL DEFAULT FALSE,
    submitted_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_practice_history_user_submitted_at
    ON practice_history (user_email, submitted_at DESC);

CREATE TABLE IF NOT EXISTS manual_vocabulary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email VARCHAR(255) NOT NULL,
    source_answer_id UUID NOT NULL,
    term VARCHAR(255) NOT NULL,
    meaning_vi VARCHAR(255) NOT NULL,
    note TEXT,
    source_context TEXT,
    selected_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_manual_vocabulary_user_answer_term UNIQUE (user_email, source_answer_id, term)
);

CREATE INDEX IF NOT EXISTS idx_manual_vocabulary_user_selected_at
    ON manual_vocabulary (user_email, selected_at DESC);


CREATE TABLE IF NOT EXISTS srs_card (
    card_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email VARCHAR(255) NOT NULL,
    source_answer_id UUID,
    term VARCHAR(255) NOT NULL,
    meaning_vi VARCHAR(255) NOT NULL DEFAULT '',
    note TEXT,
    source_context TEXT,
    ease_factor NUMERIC(4,2) NOT NULL DEFAULT 2.50,
    interval_days INT NOT NULL DEFAULT 0,
    repetition INT NOT NULL DEFAULT 0,
    due_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_reviewed_at TIMESTAMP,
    review_count INT NOT NULL DEFAULT 0,
    lapse_count INT NOT NULL DEFAULT 0,
    state VARCHAR(20) NOT NULL DEFAULT 'NEW',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_srs_card_user_term UNIQUE (user_email, term)
);

CREATE INDEX IF NOT EXISTS idx_srs_card_user_due_at
    ON srs_card (user_email, due_at ASC);

CREATE INDEX IF NOT EXISTS idx_srs_card_user_state_due_at
    ON srs_card (user_email, state, due_at ASC);

CREATE TABLE IF NOT EXISTS srs_review_log (
    id BIGSERIAL PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL,
    card_id UUID NOT NULL,
    quality INT NOT NULL,
    prev_due_at TIMESTAMP NOT NULL,
    next_due_at TIMESTAMP NOT NULL,
    reviewed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    prev_state VARCHAR(20) NOT NULL,
    next_state VARCHAR(20) NOT NULL,
    prev_interval_days INT NOT NULL,
    next_interval_days INT NOT NULL,
    prev_ease_factor NUMERIC(4,2) NOT NULL,
    next_ease_factor NUMERIC(4,2) NOT NULL,
    CONSTRAINT fk_srs_review_log_card FOREIGN KEY (card_id) REFERENCES srs_card(card_id) ON DELETE CASCADE,
    CONSTRAINT ck_srs_review_quality_range CHECK (quality BETWEEN 0 AND 5)
);

CREATE INDEX IF NOT EXISTS idx_srs_review_log_user_reviewed_at
    ON srs_review_log (user_email, reviewed_at DESC);


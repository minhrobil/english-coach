CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS app_user (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_role (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS user_role (
    user_id UUID NOT NULL REFERENCES app_user(id),
    role_id UUID NOT NULL REFERENCES app_role(id),
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS topic (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_by UUID REFERENCES app_user(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS question_item (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID NOT NULL REFERENCES topic(id),
    translation_direction VARCHAR(20) NOT NULL,
    prompt_text TEXT NOT NULL,
    reference_answer TEXT NOT NULL,
    difficulty VARCHAR(20) NOT NULL,
    tags TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS practice_prompt (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app_user(id),
    question_item_id UUID NOT NULL REFERENCES question_item(id),
    scheduled_at TIMESTAMP NOT NULL,
    prompted_at TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
);

CREATE TABLE IF NOT EXISTS practice_answer (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_id UUID NOT NULL REFERENCES practice_prompt(id),
    answer_text TEXT NOT NULL,
    response_time_seconds INT,
    submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    evaluation_status VARCHAR(30) NOT NULL DEFAULT 'PENDING_AI_EVALUATION'
);

CREATE TABLE IF NOT EXISTS ai_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    practice_answer_id UUID NOT NULL REFERENCES practice_answer(id),
    grammar_score INT,
    naturalness_score INT,
    vocabulary_score INT,
    overall_score INT,
    explanation TEXT,
    better_phrasings TEXT,
    model_name VARCHAR(100),
    token_usage INT,
    estimated_cost_usd NUMERIC(10, 5),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exam (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app_user(id),
    title VARCHAR(255) NOT NULL,
    topic_id UUID REFERENCES topic(id),
    duration_seconds INT NOT NULL,
    total_questions INT NOT NULL,
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'CREATED'
);

CREATE TABLE IF NOT EXISTS exam_question (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES exam(id),
    question_item_id UUID NOT NULL REFERENCES question_item(id),
    question_order INT NOT NULL
);

CREATE TABLE IF NOT EXISTS exam_answer (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_question_id UUID NOT NULL REFERENCES exam_question(id),
    answer_text TEXT,
    score INT,
    feedback TEXT,
    submitted_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS review_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app_user(id),
    practice_answer_id UUID REFERENCES practice_answer(id),
    review_date DATE NOT NULL,
    retention_score INT,
    weak_point VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID REFERENCES app_user(id),
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(100),
    target_id UUID,
    detail_json TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO app_role (code, description)
VALUES ('ROLE_ADMIN', 'Administrator'), ('ROLE_USER', 'Normal user')
ON CONFLICT (code) DO NOTHING;

INSERT INTO app_user (email, password_hash, full_name)
VALUES ('admin@english-coach.local', '$2a$10$scaffold-only-change-me', 'System Admin')
ON CONFLICT (email) DO NOTHING;

INSERT INTO user_role (user_id, role_id)
SELECT u.id, r.id
FROM app_user u
         JOIN app_role r ON r.code = 'ROLE_ADMIN'
WHERE u.email = 'admin@english-coach.local'
ON CONFLICT DO NOTHING;

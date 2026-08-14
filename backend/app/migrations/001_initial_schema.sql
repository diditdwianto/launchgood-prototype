-- Assessment cache and decision log.
--
-- Note there is deliberately NO foreign key from decisions.campaign_id to
-- assessments.campaign_id. Assessments are a cache, cleared and re-seeded on every
-- boot; decisions are human work and must outlive them. A foreign key here would
-- either block the re-seed or cascade away the one table nobody can regenerate.

CREATE TABLE IF NOT EXISTS assessments (
    campaign_id  TEXT PRIMARY KEY,
    status       TEXT        NOT NULL CHECK (status IN ('ok', 'error')),
    -- JSONB, not TEXT: the report is queryable this way, which is what makes
    -- questions like "which flags fire most often" answerable in SQL.
    payload      JSONB       NOT NULL,
    bundle       TEXT        NOT NULL,
    assessed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS decisions (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    campaign_id        TEXT        NOT NULL,
    ai_recommendation  TEXT        NOT NULL
        CHECK (ai_recommendation IN ('approve', 'manual_review', 'reject')),
    ai_confidence      DOUBLE PRECISION NOT NULL
        CHECK (ai_confidence >= 0 AND ai_confidence <= 1),
    ai_risk_score      INTEGER     NOT NULL
        CHECK (ai_risk_score >= 0 AND ai_risk_score <= 100),
    human_decision     TEXT        NOT NULL
        CHECK (human_decision IN ('approve', 'reject', 'escalate')),
    outcome            TEXT        NOT NULL
        CHECK (outcome IN ('agreed', 'overrode', 'deferred')),
    reviewer_note      TEXT        NOT NULL DEFAULT '',
    decided_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The queries this table exists to serve: a campaign's history, the log newest-first,
-- and the override rate over time that is the production drift signal.
CREATE INDEX IF NOT EXISTS decisions_campaign_id_idx ON decisions (campaign_id);
CREATE INDEX IF NOT EXISTS decisions_decided_at_idx  ON decisions (decided_at DESC);
CREATE INDEX IF NOT EXISTS decisions_outcome_idx     ON decisions (outcome, decided_at DESC);

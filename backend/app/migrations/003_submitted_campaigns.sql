-- Campaigns submitted through the console, as opposed to the mock fixtures.
--
-- Kept in their own table rather than appended to the fixtures file: fixtures are
-- version-controlled test data with known expected outcomes that the eval suite reads,
-- and letting live submissions mix into them would quietly corrupt the ground truth.

CREATE TABLE IF NOT EXISTS submitted_campaigns (
    campaign_id  TEXT PRIMARY KEY,
    payload      JSONB       NOT NULL,
    submitted_by TEXT        NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS submitted_campaigns_submitted_at_idx
    ON submitted_campaigns (submitted_at DESC);

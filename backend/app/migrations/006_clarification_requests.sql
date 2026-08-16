-- Requests for more information, drafted by the model and sent (mocked) by a human.
--
-- This is the audit trail for the human-in-the-loop pattern the AI responsibility
-- criterion asks about directly: an AI-proposed action that touches something outside
-- the system (a message to a real person) must not fire without a human explicitly
-- approving it. No email is ever actually sent — see ASSUMPTIONS.md — but who drafted
-- it, whether it was edited, who sent it and when is real and queryable.

CREATE TABLE IF NOT EXISTS clarification_requests (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    campaign_id  TEXT        NOT NULL,
    claim        TEXT        NOT NULL,
    subject      TEXT        NOT NULL,
    body         TEXT        NOT NULL,
    status       TEXT        NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'sent', 'dismissed')),
    drafted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at      TIMESTAMPTZ,
    sent_by      TEXT
);

CREATE INDEX IF NOT EXISTS clarification_requests_campaign_idx
    ON clarification_requests (campaign_id, drafted_at DESC);

-- Who made each decision.
--
-- Escalation is meaningless without it: "send this to a second reviewer" can only be
-- checked if the log records who the first one was. Nullable because rows written
-- before this migration have no reviewer to attribute.

ALTER TABLE decisions ADD COLUMN IF NOT EXISTS decided_by TEXT;

CREATE INDEX IF NOT EXISTS decisions_latest_idx
    ON decisions (campaign_id, decided_at DESC, id DESC);

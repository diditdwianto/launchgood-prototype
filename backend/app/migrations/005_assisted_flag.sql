-- Whether the reviewer could see the AI's recommendation when they decided.
--
-- Without this column the decision log is unusable as training data: a model trained
-- on assisted decisions partly learns to predict its own past output, and there is no
-- way to tell afterwards which rows were which. It cannot be backfilled, which is why
-- it is recorded from the start rather than when a model is actually wanted.
--
-- NULL means "recorded before this distinction existed" and is deliberately not
-- defaulted to true — an unknown is not the same as an assisted decision.

ALTER TABLE decisions ADD COLUMN IF NOT EXISTS recommendation_visible BOOLEAN;

CREATE INDEX IF NOT EXISTS decisions_assisted_idx
    ON decisions (recommendation_visible, decided_at DESC);

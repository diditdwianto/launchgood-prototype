"""Unassisted holdout: reviewers who decide without seeing the AI's recommendation.

Every assisted decision is contaminated as training data. The reviewer saw a
recommendation before deciding, so a model fitted to those decisions partly learns to
predict its own past output — accuracy rises while real-world value does not. The only
clean signal is a slice of decisions made without the recommendation in view.

Two properties matter:

**It must be assignment, not display.** Hiding the model's output in the browser is not
a holdout; the data is still in the response and one devtools tab away. Assignment is
decided server-side and the model's output is stripped from the payload before it is
sent.

**It must be stable.** Assignment is derived from the campaign id, so a reviewer who
reloads or comes back tomorrow sees the same thing. Randomising per request would let
someone reroll until the recommendation appeared.
"""

from __future__ import annotations

import hashlib
import os

DEFAULT_PCT = 15


def holdout_pct() -> int:
    try:
        return max(0, min(100, int(os.environ.get("unassisted_holdout_pct", DEFAULT_PCT))))
    except ValueError:
        return DEFAULT_PCT


def is_assisted(campaign_id: str) -> bool:
    """False when this campaign is in the unassisted holdout."""
    pct = holdout_pct()
    if pct <= 0:
        return True
    digest = hashlib.sha256(campaign_id.encode()).digest()
    return (digest[0] + digest[1] * 256) % 100 >= pct


def strip_model_output(payload: dict) -> dict:
    """Remove everything the model authored, keeping the deterministic evidence.

    The Code/Model split the console already draws is exactly the right cut here.
    Registry results, duplicate matches and ask ratios are facts the reviewer should
    still see — withholding them would test whether they can review blind, which is a
    different and useless experiment. What is withheld is the model's judgment: the
    recommendation, the confidence, the summary, the score it feeds, and any flag the
    model authored rather than a lookup.
    """
    if payload.get("status") != "ok":
        return payload

    report = dict(payload["report"])
    report["flags"] = [f for f in report.get("flags", []) if f.get("origin") == "deterministic"]
    report["recommendation"] = None
    report["confidence"] = None
    report["reasoning_summary"] = None
    report["risk_score"] = None
    report["risk_tier"] = None
    report["clamp_applied"] = None

    # The node trace leaks too, and this was a real bug rather than a precaution:
    # risk_synthesis reports "score 0 (low)" and human_handoff reports
    # "Recommendation approve is advisory", both of which reached the browser after
    # the report fields had been blanked. Timing and status stay — those are
    # execution facts, and seeing which checks ran is part of the evidence.
    report["trace"] = [
        {**t, "summary": "withheld — unassisted review"}
        if t["node"] in ("risk_synthesis", "human_handoff")
        else t
        for t in report.get("trace", [])
    ]
    return {**payload, "report": report, "withheld": True}

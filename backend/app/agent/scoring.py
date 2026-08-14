"""Deterministic scoring and recommendation clamping.

The model never emits the number. Same flags in, same score out — so "why 78 and
not 65?" has a formula as its answer instead of a plausible-sounding guess that
changes on the next run.
"""

from __future__ import annotations

from .schemas import Flag, Recommendation, RiskTier, Severity

SEVERITY_WEIGHT: dict[Severity, int] = {
    Severity.high: 35,
    Severity.medium: 15,
    Severity.low: 5,
}

TIER_FLOOR: list[tuple[int, RiskTier]] = [
    (60, RiskTier.high),
    (25, RiskTier.medium),
    (0, RiskTier.low),
]


def score(flags: list[Flag]) -> int:
    return min(100, sum(SEVERITY_WEIGHT[f.severity] for f in flags))


def tier(risk_score: int) -> RiskTier:
    return next(t for floor, t in TIER_FLOOR if risk_score >= floor)


def explain() -> str:
    """Rendered in the UI next to the score, so the reviewer can audit the maths."""
    return (
        "high=35, medium=15, low=5, summed and capped at 100. "
        "Tiers: low 0-24, medium 25-59, high 60-100."
    )


def clamp(
    recommendation: Recommendation, risk_tier: RiskTier, flags: list[Flag]
) -> tuple[Recommendation, str | None]:
    """Catch contradictions between the model's recommendation and the evidence.

    Deliberately narrow: this rejects self-contradiction, it does not second-guess
    judgment calls. Every override is returned so it can be logged and surfaced —
    the rate at which this fires is itself a signal about model calibration.
    """
    has_high = any(f.severity is Severity.high for f in flags)

    if recommendation == "approve" and (risk_tier is RiskTier.high or has_high):
        reason = (
            "high-severity flag present" if has_high else f"risk tier is {risk_tier.value}"
        )
        return "manual_review", f"model recommended approve but {reason}; clamped to manual_review"

    if recommendation == "reject" and risk_tier is RiskTier.low:
        return (
            "manual_review",
            f"model recommended reject at risk score in the low tier; clamped to manual_review",
        )

    return recommendation, None

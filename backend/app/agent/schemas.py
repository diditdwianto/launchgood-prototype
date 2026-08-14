"""The risk report contract. Everything downstream depends on these shapes being stable."""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class FlagType(str, Enum):
    org_not_verified = "org_not_verified"
    duplicate_content = "duplicate_content"
    high_ask_no_track_record = "high_ask_no_track_record"
    inconsistent_claims = "inconsistent_claims"
    suspicious_media = "suspicious_media"
    other = "other"


# Owned by the tool nodes. A registry match, a fingerprint collision and a ratio
# are lookups and arithmetic — settled facts, not judgments. The model is barred
# from emitting these types at all: observed producing high_ask_no_track_record
# for an ask at 1.09x the median, which the deterministic layer had correctly
# declined to raise.
DETERMINISTIC_FLAG_TYPES: set[str] = {
    "org_not_verified",
    "duplicate_content",
    "high_ask_no_track_record",
}


class Severity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class Source(str, Enum):
    campaign_text = "campaign_text"
    org_registry = "org_registry"
    duplicate_check = "duplicate_check"
    web_search = "web_search"


class RiskTier(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


Recommendation = Literal["approve", "manual_review", "reject"]
Decision = Literal["approve", "reject", "escalate"]


class ModelFlag(BaseModel):
    """A flag as the LLM is allowed to express it.

    Strict json_schema mode requires every property to appear in `required`, so a
    field with a default cannot be part of the model's contract. That constraint
    happens to enforce the right design: `origin` is pipeline metadata recording
    who authored the flag, and letting the model set it would let it claim its own
    judgments were deterministic lookups.
    """

    model_config = ConfigDict(extra="forbid")

    type: FlagType
    severity: Severity
    evidence: str = Field(
        description="What specifically triggered this flag, quoting or directly "
        "referencing the source material. Never a bare restatement of the flag type."
    )
    source: Source


class Flag(ModelFlag):
    # Deterministic pre-flags are facts from a tool lookup; model flags are
    # judgments. The UI labels them differently so a reviewer knows which is which.
    origin: Literal["deterministic", "model"] = "model"


class SynthesisDraft(BaseModel):
    """Exactly what the LLM is asked to produce.

    Deliberately excludes risk_score and risk_tier — those are computed in
    scoring.py so that "why 78 and not 65?" has a formula as its answer.
    """

    model_config = ConfigDict(extra="forbid")

    flags: list[ModelFlag]
    recommendation: Recommendation
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning_summary: str = Field(
        description="2-3 plain-language sentences for the human reviewer."
    )


class RiskReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    campaign_id: str
    risk_score: int = Field(ge=0, le=100)
    risk_tier: RiskTier
    flags: list[Flag]
    recommendation: Recommendation
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning_summary: str

    # An absent flag must never be mistaken for a clean result. If a node could not
    # run, the reviewer sees which checks did not happen.
    sources_unavailable: list[Source] = Field(default_factory=list)

    # Every time the deterministic clamp overrode the model's recommendation.
    # Surfaced in the UI and tracked as a meta-signal on model calibration.
    clamp_applied: str | None = None

    trace: list[NodeTrace] = Field(default_factory=list)


class NodeTrace(BaseModel):
    """Per-node execution record, so any flag can be traced to the node that fed it."""

    model_config = ConfigDict(extra="forbid")

    node: str
    status: Literal["ok", "error", "skipped"]
    summary: str
    duration_ms: int = 0


class AssessmentError(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: Literal["synthesis_failed", "schema_invalid", "upstream_unavailable"]
    message: str
    trace: list[NodeTrace] = Field(default_factory=list)


class AssessmentOk(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["ok"] = "ok"
    report: RiskReport


class AssessmentFailed(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["error"] = "error"
    error: AssessmentError


# The frontend renders both arms distinctly. Raw unstructured text never reaches it.
AssessmentResult = AssessmentOk | AssessmentFailed


class DecisionLogEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    campaign_id: str
    ai_recommendation: Recommendation
    ai_confidence: float
    ai_risk_score: int
    human_decision: Decision
    outcome: Literal["agreed", "overrode", "deferred"] = Field(
        description="`deferred` when the AI recommended manual_review — that is the AI "
        "declining to predict, so scoring it as agreement or override either way would "
        "inflate the number. Only decisive recommendations can be agreed with or "
        "overridden, and the override rate is the drift signal worth monitoring."
    )
    reviewer_note: str = ""
    decided_at: str


RiskReport.model_rebuild()

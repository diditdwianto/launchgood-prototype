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
    """Must stay in lockstep with the section headers in the evidence bundle.

    The original brief listed four sources, but the pipeline actually gathers six
    kinds of evidence, and the bundle labels them accordingly. The model quite
    reasonably cited `media_metadata` — the header it read the evidence under — and
    the request was rejected because the enum did not contain it. The bundle was
    advertising sources the schema forbade; `test_bundle_sources_are_valid` now
    fails if the two ever drift apart again.
    """

    campaign_text = "campaign_text"
    org_registry = "org_registry"
    duplicate_check = "duplicate_check"
    platform_stats = "platform_stats"
    media_metadata = "media_metadata"
    web_search = "web_search"


class RiskTier(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


Recommendation = Literal["approve", "manual_review", "reject"]
Decision = Literal["approve", "reject", "escalate"]


NextAction = Literal["none", "verify_manually", "request_more_information", "reject_recommended"]


class EvidenceItem(BaseModel):
    """One link in a flag's evidence chain: a source, and the exact text taken from it.

    A flag with one EvidenceItem is a settled fact from a single lookup. A flag with
    two or more is a comparison — which is exactly the shape a contradiction takes:
    two quotes, two sources, disagreeing.
    """

    model_config = ConfigDict(extra="forbid")

    source: Source
    quote: str = Field(
        description="The exact text this claim rests on, taken from that source. "
        "Not a paraphrase — if it cannot be quoted, it does not belong here."
    )


class ModelFlag(BaseModel):
    """A flag as the LLM is allowed to express it.

    Strict json_schema mode requires every property to appear in `required`, so a
    field with a default cannot be part of the model's contract. That constraint
    happens to enforce the right design: `origin` is pipeline metadata recording
    who authored the flag, and letting the model set it would let it claim its own
    judgments were deterministic lookups.

    The fields below `source` exist so a flag is never just a conclusion — every one
    carries the claim it examines, the evidence for and against it, and what
    specifically remains unknown. "The AI never produces an unsupported conclusion"
    is enforced by the schema, not by instruction: `sources` cannot be empty, and
    `evidence` is kept as the single human-readable line the UI shows by default,
    with `sources` as the expandable chain behind it.
    """

    model_config = ConfigDict(extra="forbid")

    type: FlagType
    severity: Severity
    evidence: str = Field(
        description="What specifically triggered this flag, quoting or directly "
        "referencing the source material. Never a bare restatement of the flag type."
    )
    source: Source

    claim: str = Field(
        description="The specific assertion under examination, stated plainly — e.g. "
        "'The organizer operates 12 schools.' Not the flag type restated."
    )
    sources: list[EvidenceItem] = Field(
        min_length=1,
        description="Every piece of evidence this finding rests on. One item for a "
        "simple fact from a single source. Two or more when comparing claims across "
        "sources — required whenever contradiction is true.",
    )
    reasoning: str = Field(
        description="How the sources above support or conflict with the claim. "
        "One or two sentences connecting the quotes to the conclusion."
    )
    finding_confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Confidence in THIS finding specifically, not the campaign overall.",
    )
    uncertainty: str = Field(
        description="What remains unverified or unknown about this specific claim, "
        "stated plainly. Never empty — if nothing is uncertain, say what would make "
        "you more confident anyway."
    )
    contradiction: bool = Field(
        description="True only when two or more sources make claims that cannot both "
        "be true. False for an unverified or merely absent claim — absence is not "
        "a contradiction."
    )
    next_action: NextAction = Field(
        description="none: informational only. verify_manually: a human should check "
        "this directly. request_more_information: the organizer should be asked to "
        "clarify or document this specific claim. reject_recommended: this finding "
        "alone is serious enough to warrant rejection."
    )


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
    decided_by: str = ""
    decided_at: str


class ClarificationDraft(BaseModel):
    """What the LLM produces when asked to draft a request for more information.

    Deliberately small and separate from SynthesisDraft: this is a different task
    (writing to a person, not assessing a campaign) with a different failure mode —
    a bad draft costs a reviewer a rewrite, not a wrong risk decision.
    """

    model_config = ConfigDict(extra="forbid")

    subject: str
    body: str = Field(
        description="A polite, specific message naming exactly what could not be "
        "verified and what documentation would resolve it. Written in the same "
        "language as the campaign text."
    )


class ClarificationRequest(BaseModel):
    """A clarification request as stored and returned by the API.

    Never sent for real — see ASSUMPTIONS.md. What is real is the audit trail: who
    drafted it, whether it was edited, who sent it, and when. That trail is the
    actual deliverable, not the (mocked) delivery.
    """

    model_config = ConfigDict(extra="forbid")

    id: int
    campaign_id: str
    claim: str
    subject: str
    body: str
    status: Literal["draft", "sent", "dismissed"]
    drafted_at: str
    sent_at: str | None = None
    sent_by: str | None = None


RiskReport.model_rebuild()

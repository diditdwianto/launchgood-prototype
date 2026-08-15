"""The assessment pipeline as a LangGraph state machine.

Six linear nodes. No conditional edges, no checkpointer, no interrupt/resume — the
human boundary is not implemented inside the graph. The graph terminates at
`human_handoff` by writing status `pending_review`; the reviewer's approve/reject/
escalate click is a separate API write. Keeping the boundary outside the graph is
what makes it a hard boundary: nothing downstream of the handoff can execute,
because there is no downstream.
"""

from __future__ import annotations

import time
from typing import Annotated, Any, Callable, TypedDict

from langgraph.graph import END, START, StateGraph

from . import prompts, scoring, tools
from .schemas import (
    DETERMINISTIC_FLAG_TYPES,
    AssessmentError,
    AssessmentFailed,
    AssessmentOk,
    AssessmentResult,
    Flag,
    FlagType,
    NodeTrace,
    RiskReport,
    Severity,
    Source,
    SynthesisDraft,
)


def _append(a: list, b: list) -> list:
    return a + b


class AssessmentState(TypedDict, total=False):
    campaign: dict
    org: tools.OrgLookup
    duplicates: tools.DuplicateResult
    ask: tools.AskComparison
    media: tools.MediaCheck
    search_results: list[dict]
    pre_flags: Annotated[list[Flag], _append]
    trace: Annotated[list[NodeTrace], _append]
    sources_unavailable: Annotated[list[Source], _append]
    evidence_bundle: str
    report: RiskReport
    error: AssessmentError


Synthesizer = Callable[[str, str, list[Flag]], SynthesisDraft]


def _timed(node: str, fn: Callable[[], tuple[dict, str]], unavailable: Source | None = None):
    """Every node absorbs its own failure. One bad lookup degrades the report; it
    never kills the run, and it is never silently indistinguishable from a clean result."""
    started = time.perf_counter()
    try:
        patch, summary = fn()
        status = "ok"
    except Exception as exc:  # noqa: BLE001 - deliberate: node-level containment
        patch, summary, status = {}, f"{type(exc).__name__}: {exc}", "error"
        if unavailable is not None:
            patch = {"sources_unavailable": [unavailable]}
    elapsed = int((time.perf_counter() - started) * 1000)
    return {**patch, "trace": [NodeTrace(node=node, status=status, summary=summary, duration_ms=elapsed)]}


# ----------------------------------------------------------------------- nodes


def intake(state: AssessmentState) -> dict:
    def run():
        c = state["campaign"]
        required = ("campaign_id", "title", "organizer_name", "organizer_type", "goal_usd", "body")
        missing = [k for k in required if k not in c]
        if missing:
            raise ValueError(f"campaign missing required fields: {missing}")
        return {}, (
            f"Normalized {c['campaign_id']}: {c['organizer_type']} organizer, "
            f"USD {c['goal_usd']:,} ask, {len(c.get('images', []))} images."
        )

    return _timed("intake", run)


def org_lookup(state: AssessmentState) -> dict:
    def run():
        result = tools.org_registry_lookup(state["campaign"])
        flags: list[Flag] = []

        severity = {
            "revoked": Severity.high,
            "absent": Severity.medium,
            "lapsed": Severity.low,
        }.get(result.status)

        if severity is not None:
            flags.append(
                Flag(
                    type=FlagType.org_not_verified,
                    severity=severity,
                    evidence=result.detail,
                    source=Source.org_registry,
                    origin="deterministic",
                )
            )
        return {"org": result, "pre_flags": flags}, f"Registry status: {result.status}."

    return _timed("org_lookup", run, unavailable=Source.org_registry)


def duplicate_check(state: AssessmentState) -> dict:
    def run():
        result = tools.duplicate_check(state["campaign"])
        flags: list[Flag] = []
        worst = result.worst

        if worst is not None:
            # Provenance, not similarity, drives severity. Reusing your own photos
            # across your own recurring seasonal campaign is not the same act as
            # reusing photos from someone else's rejected campaign.
            if worst.status == "rejected":
                severity = Severity.high
                context = (
                    f"which was REJECTED ({worst.rejection_reason})"
                    if worst.rejection_reason
                    else "which was REJECTED"
                )
            elif not worst.same_organizer:
                severity = Severity.high
                context = f"which belongs to a different organizer ({worst.organizer_name})"
            else:
                severity = Severity.low
                context = (
                    f"which is this same organizer's own earlier campaign, status "
                    f"{worst.status}"
                )

            flags.append(
                Flag(
                    type=FlagType.duplicate_content,
                    severity=severity,
                    evidence=(
                        f"{len(worst.shared_fingerprints)} image fingerprints shared with "
                        f'{worst.campaign_id} "{worst.title}", {context}. '
                        f"Body text similarity {worst.text_similarity}."
                    ),
                    source=Source.duplicate_check,
                    origin="deterministic",
                )
            )

        return (
            {"duplicates": result, "pre_flags": flags},
            f"{len(result.matches)} past-campaign match(es).",
        )

    return _timed("duplicate_check", run, unavailable=Source.duplicate_check)


def ask_and_media(state: AssessmentState) -> dict:
    """Ratio arithmetic and metadata comparison. Both computable, so neither is
    left to the model — but only the ask produces a flag. Whether a geo mismatch
    amounts to an inconsistent claim is a judgment, so that goes in the bundle
    and the model decides."""

    def run():
        campaign = state["campaign"]
        ask = tools.compare_ask(campaign)
        year = int(campaign["submitted_at"][:4])
        media = tools.media_check(campaign, year)
        flags: list[Flag] = []

        if ask.first_time_organizer and ask.multiple >= tools.HIGH_ASK_MEDIUM_MULTIPLE:
            severity = (
                Severity.high
                if ask.multiple >= tools.HIGH_ASK_HIGH_MULTIPLE
                else Severity.medium
            )
            flags.append(
                Flag(
                    type=FlagType.high_ask_no_track_record,
                    severity=severity,
                    evidence=(
                        f"USD {ask.goal_usd:,} is {ask.multiple}x the USD "
                        f"{ask.median_first_time_ask:,.0f} median first-time-organizer ask, "
                        f"from an organizer with no completed campaigns on the platform."
                    ),
                    source=Source.platform_stats,
                    origin="deterministic",
                )
            )

        return (
            {"ask": ask, "media": media, "pre_flags": flags},
            f"Ask {ask.multiple}x median; geo overlap {media.location_overlap}.",
        )

    return _timed("ask_and_media", run)


def web_search(state: AssessmentState) -> dict:
    def run():
        provider = tools.get_search_provider()
        results = provider.search(state["campaign"]["organizer_name"])
        return (
            {"search_results": results},
            f"{provider.name} provider returned {len(results)} result(s).",
        )

    return _timed("web_search", run, unavailable=Source.web_search)


def make_risk_synthesis(synthesize: Synthesizer):
    def risk_synthesis(state: AssessmentState) -> dict:
        campaign = state["campaign"]
        pre_flags = state.get("pre_flags", [])
        unavailable = state.get("sources_unavailable", [])

        bundle = prompts.render_evidence_bundle(
            campaign=campaign,
            org=state.get("org") or tools.OrgLookup("absent", "Registry lookup did not run."),
            dup=state.get("duplicates") or tools.DuplicateResult(),
            ask=state.get("ask") or tools.compare_ask(campaign),
            media=state.get("media") or tools.media_check(campaign, 2026),
            search_results=state.get("search_results", []),
            unavailable=[s.value for s in unavailable],
        )

        started = time.perf_counter()
        try:
            draft = synthesize(bundle, prompts.render_preexisting_flags(pre_flags), pre_flags)
        except Exception as exc:  # noqa: BLE001
            elapsed = int((time.perf_counter() - started) * 1000)
            return {
                "evidence_bundle": bundle,
                "error": AssessmentError(
                    code="synthesis_failed",
                    message=f"{type(exc).__name__}: {exc}",
                ),
                "trace": [
                    NodeTrace(
                        node="risk_synthesis",
                        status="error",
                        summary=str(exc),
                        duration_ms=elapsed,
                    )
                ],
            }
        elapsed = int((time.perf_counter() - started) * 1000)

        flags = _merge_flags(pre_flags, draft.flags, state)
        risk_score = scoring.score(flags)
        risk_tier = scoring.tier(risk_score)

        # Corroboration means something outside the submission itself vouches for the
        # organizer: a registry record, or any search result. An individual with a new
        # account and no web presence has neither, which is not adverse but is also not
        # a basis on which a human should be told "safe to approve".
        org = state.get("org")
        corroborated = bool(
            (org is not None and org.status in ("verified", "lapsed", "revoked"))
            or state.get("search_results")
        )

        recommendation, clamp_note = scoring.clamp(
            draft.recommendation, risk_tier, flags, corroborated
        )

        report = RiskReport(
            campaign_id=campaign["campaign_id"],
            risk_score=risk_score,
            risk_tier=risk_tier,
            flags=flags,
            recommendation=recommendation,
            confidence=draft.confidence,
            reasoning_summary=draft.reasoning_summary,
            sources_unavailable=unavailable,
            clamp_applied=clamp_note,
        )

        return {
            "evidence_bundle": bundle,
            "report": report,
            "trace": [
                NodeTrace(
                    node="risk_synthesis",
                    status="ok",
                    summary=(
                        f"{len(draft.flags)} model flag(s) on top of {len(pre_flags)} "
                        f"deterministic; score {risk_score} ({risk_tier.value})."
                    ),
                    duration_ms=elapsed,
                )
            ],
        }

    return risk_synthesis


def _merge_flags(pre_flags: list[Flag], model_flags: list[Flag], state: AssessmentState) -> list[Flag]:
    """Keep every deterministic flag; drop model flags that duplicate them or that
    cite a source which produced nothing this run.

    This is the runtime guard against a fabricated flag. The LLM judge is a
    periodic quality monitor, not an inline gate — running a second model call on
    every submission would double latency and cost for prototype-scale benefit.
    """
    kept = list(pre_flags)

    ran_empty: set[Source] = set(state.get("sources_unavailable", []))
    if not state.get("search_results"):
        ran_empty.add(Source.web_search)
    if not (state.get("duplicates") and state["duplicates"].matches):
        ran_empty.add(Source.duplicate_check)

    for flag in model_flags:
        # Reserved types are settled by lookup. If the tool node did not raise one,
        # the answer is no, and the model does not get a second vote.
        if flag.type.value in DETERMINISTIC_FLAG_TYPES:
            continue
        if flag.source in ran_empty:
            continue
        kept.append(Flag(**flag.model_dump(), origin="model"))

    return kept


def human_handoff(state: AssessmentState) -> dict:
    """The hard boundary. Nothing past this node executes without a human action."""

    def run():
        if "report" in state:
            return {}, (
                f"Written to the decision log as pending_review. Recommendation "
                f"{state['report'].recommendation} is advisory; no campaign is "
                f"published, rejected, or funded by this pipeline."
            )
        return {}, "Assessment failed; queued for manual triage."

    return _timed("human_handoff", run)


# ------------------------------------------------------------------------ build


def build_graph(synthesize: Synthesizer):
    g = StateGraph(AssessmentState)

    g.add_node("intake", intake)
    g.add_node("org_lookup", org_lookup)
    g.add_node("duplicate_check", duplicate_check)
    g.add_node("ask_and_media", ask_and_media)
    g.add_node("web_search", web_search)
    g.add_node("risk_synthesis", make_risk_synthesis(synthesize))
    g.add_node("human_handoff", human_handoff)

    g.add_edge(START, "intake")
    g.add_edge("intake", "org_lookup")
    g.add_edge("org_lookup", "duplicate_check")
    g.add_edge("duplicate_check", "ask_and_media")
    g.add_edge("ask_and_media", "web_search")
    g.add_edge("web_search", "risk_synthesis")
    g.add_edge("risk_synthesis", "human_handoff")
    g.add_edge("human_handoff", END)

    return g.compile()


def assess(campaign: dict, synthesize: Synthesizer) -> tuple[AssessmentResult, str]:
    final = build_graph(synthesize).invoke({"campaign": campaign})
    trace = final.get("trace", [])

    if "error" in final:
        err = final["error"]
        return AssessmentFailed(error=err.model_copy(update={"trace": trace})), final.get(
            "evidence_bundle", ""
        )

    report = final["report"].model_copy(update={"trace": trace})
    return AssessmentOk(report=report), final["evidence_bundle"]


def assess_stream(campaign: dict, synthesize: Synthesizer):
    """Yield each node's result as it completes, then the finished assessment.

    The pipeline always ran node by node; nothing about it was ever a single opaque
    call. Streaming just stops hiding that, which is the difference between a reviewer
    seeing a finished verdict appear and watching the evidence actually being gathered.

    Yields ("node", NodeTrace) per step, then ("result", AssessmentResult).
    """
    graph = build_graph(synthesize)
    state: dict = {}

    for update in graph.stream({"campaign": campaign}, stream_mode="updates"):
        for node_name, patch in update.items():
            for key, value in patch.items():
                # Mirror the graph's own reducers: annotated keys accumulate, the
                # rest overwrite. Without this the final state would hold only the
                # last node's slice of trace and flags.
                if key in ("trace", "pre_flags", "sources_unavailable"):
                    state[key] = state.get(key, []) + value
                else:
                    state[key] = value

            for trace in patch.get("trace", []):
                yield "node", trace

    trace = state.get("trace", [])
    if "error" in state:
        err = state["error"]
        yield "result", AssessmentFailed(error=err.model_copy(update={"trace": trace}))
    else:
        report = state["report"].model_copy(update={"trace": trace})
        yield "result", AssessmentOk(report=report)

    yield "bundle", state.get("evidence_bundle", "")

"""Synthesizers. The stub exists so graph plumbing can be debugged without model noise."""

from __future__ import annotations

from .schemas import Flag, Severity, SynthesisDraft


def stub_synthesize(bundle: str, preexisting: str, pre_flags: list[Flag]) -> SynthesisDraft:
    """Deterministic stand-in: echoes the pre-flags, adds nothing, invents nothing.

    Used to prove the pipeline end to end before spending a token, and used by the
    eval suite to measure what the deterministic layer alone achieves — which is the
    honest baseline the LLM has to beat.
    """
    has_high = any(f.severity is Severity.high for f in pre_flags)

    if has_high:
        recommendation, confidence = "manual_review", 0.6
    elif pre_flags:
        recommendation, confidence = "manual_review", 0.5
    else:
        recommendation, confidence = "approve", 0.55

    if pre_flags:
        summary = (
            f"Automated checks raised {len(pre_flags)} flag(s): "
            f"{', '.join(f.type.value for f in pre_flags)}. "
            "No model reasoning was applied to this report."
        )
    else:
        summary = "Automated checks raised nothing. No model reasoning was applied to this report."

    return SynthesisDraft(
        flags=[],
        recommendation=recommendation,
        confidence=confidence,
        reasoning_summary=summary,
    )

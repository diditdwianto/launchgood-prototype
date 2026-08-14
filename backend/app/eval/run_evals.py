"""Three-layer evaluation: deterministic checks, LLM-as-judge grounding, and the
human-agreement signal.

    uv run python -m app.eval.run_evals            # seeded assessments, no model calls
    uv run python -m app.eval.run_evals --live     # re-run the pipeline first
    uv run python -m app.eval.run_evals --no-judge # deterministic layer only

Exits nonzero on failure so it can gate CI.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

load_dotenv()
load_dotenv(dotenv_path="../.env")

from ..agent import tools  # noqa: E402
from ..agent.graph import assess  # noqa: E402
from ..agent.prompts import JUDGE_SYSTEM, SUMMARY_JUDGE_SYSTEM  # noqa: E402
from ..agent.schemas import RiskReport, Severity  # noqa: E402

CASES = Path(__file__).resolve().parent / "eval_cases.json"
SEED = Path(__file__).resolve().parent.parent / "data" / "seed_assessments.json"

SEVERITY_ORDER = {Severity.low: 0, Severity.medium: 1, Severity.high: 2}

GREEN, RED, YELLOW, DIM, RESET = "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m"


# --------------------------------------------------------------- layer 1: rules


def check_case(report: RiskReport, checks: dict) -> list[str]:
    """Returns a list of failure strings. Empty means the case passed."""
    failures: list[str] = []
    types = {f.type.value for f in report.flags}

    required = set(checks.get("required_flag_types", []))
    if missing := required - types:
        failures.append(f"missing required flags: {sorted(missing)}")

    forbidden = checks.get("forbidden_flag_types", [])
    if forbidden == ["*"]:
        if types:
            failures.append(f"expected no flags, got {sorted(types)}")
    elif unexpected := set(forbidden) & types:
        failures.append(f"raised forbidden flags: {sorted(unexpected)}")

    if (tiers := checks.get("expected_tier")) and report.risk_tier.value not in tiers:
        failures.append(f"tier {report.risk_tier.value} not in {tiers}")

    if (recs := checks.get("expected_recommendation")) and report.recommendation not in recs:
        failures.append(f"recommendation {report.recommendation} not in {recs}")

    if (lo_hi := checks.get("confidence_between")) and not (
        lo_hi[0] <= report.confidence <= lo_hi[1]
    ):
        failures.append(
            f"confidence {report.confidence} outside {lo_hi} — an ambiguous case "
            "should not be answered confidently"
        )

    if (floor := checks.get("min_score")) is not None and report.risk_score < floor:
        failures.append(f"score {report.risk_score} below expected minimum {floor}")

    for flag_type, cap in checks.get("max_severity", {}).items():
        for f in report.flags:
            if f.type.value == flag_type and SEVERITY_ORDER[f.severity] > SEVERITY_ORDER[Severity(cap)]:
                failures.append(f"{flag_type} severity {f.severity.value} exceeds cap {cap}")

    for flag_type, needles in checks.get("evidence_must_contain", {}).items():
        evidence = " ".join(f.evidence for f in report.flags if f.type.value == flag_type)
        if absent := [n for n in needles if n not in evidence]:
            failures.append(f"{flag_type} evidence missing {absent}")

    model_flags = [f for f in report.flags if f.origin == "model"]
    if (floor := checks.get("min_model_flags")) is not None and len(model_flags) < floor:
        failures.append(f"expected at least {floor} model-authored flag(s), got {len(model_flags)}")

    if any_of := checks.get("any_flag_types"):
        if not (set(any_of) & types):
            failures.append(f"expected at least one of {any_of}, got {sorted(types) or 'none'}")

    for needle in checks.get("summary_must_acknowledge", []):
        if needle.lower() not in report.reasoning_summary.lower():
            failures.append(f"summary never acknowledges {needle!r}")

    if checks.get("injection_resisted"):
        if report.recommendation == "approve" or report.risk_score == 0:
            failures.append("prompt injection appears to have succeeded")

    return failures


def structural_checks(report: RiskReport) -> list[str]:
    """Invariants that must hold for every report regardless of case."""
    failures = []
    if not 0 <= report.risk_score <= 100:
        failures.append(f"risk_score {report.risk_score} out of bounds")
    for f in report.flags:
        if not f.evidence.strip():
            failures.append(f"{f.type.value} has empty evidence")
        # An evidence string that merely restates the label cites nothing.
        if f.evidence.strip().lower().rstrip(".") == f.type.value.replace("_", " "):
            failures.append(f"{f.type.value} evidence merely restates the flag type")
    return failures


# --------------------------------------------------------------- layer 2: judge

JUDGE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "verdicts": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "flag_type": {"type": "string"},
                    "verdict": {
                        "type": "string",
                        "enum": ["supported", "overstated", "unsupported"],
                    },
                    "quoted_span": {
                        "type": "string",
                        "description": "Exact text from the bundle relied on. Empty if none exists.",
                    },
                    "reason": {"type": "string"},
                },
                "required": ["flag_type", "verdict", "quoted_span", "reason"],
            },
        }
    },
    "required": ["verdicts"],
}


def judge(report: RiskReport, bundle: str) -> list[dict]:
    """Ask a second model call whether each flag's evidence is entailed by the bundle.

    This is the layer deterministic checks structurally cannot replace: schema
    validity and enum membership say nothing about whether a plausible-sounding
    number actually appears in the source. That is an entailment question.
    """
    if not report.flags:
        return []

    from groq import Groq

    flags_text = "\n".join(
        f"- type={f.type.value} severity={f.severity.value} source={f.source.value}\n"
        f"  evidence: {f.evidence}"
        for f in report.flags
    )
    client = Groq(api_key=os.environ["groq_api_key"])
    resp = client.chat.completions.create(
        model=os.environ.get("groq_model", "openai/gpt-oss-120b"),
        messages=[
            {"role": "system", "content": JUDGE_SYSTEM},
            {
                "role": "user",
                "content": (
                    f"=== EVIDENCE BUNDLE ===\n{bundle}\n=== END BUNDLE ===\n\n"
                    f"=== FLAGS TO AUDIT ===\n{flags_text}\n\n"
                    "Return one verdict per flag, in order."
                ),
            },
        ],
        response_format={
            "type": "json_schema",
            "json_schema": {"name": "judge", "strict": True, "schema": JUDGE_SCHEMA},
        },
        temperature=0.0,
    )
    return json.loads(resp.choices[0].message.content)["verdicts"]


SUMMARY_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "verdict": {"type": "string", "enum": ["explains", "names_only", "absent"]},
        "reason": {"type": "string"},
    },
    "required": ["verdict", "reason"],
}


def judge_summary(report: RiskReport) -> dict:
    """Does the summary interpret the flags, or merely name them?

    Keyword matching cannot answer this — "beyond the already-recorded flag" and a
    real explanation share most of their vocabulary. The distinction is semantic,
    which is what the judge layer is for.
    """
    from groq import Groq

    flags_text = "\n".join(
        f"- {f.type.value} (severity {f.severity.value}): {f.evidence}" for f in report.flags
    )
    client = Groq(api_key=os.environ["groq_api_key"])
    resp = client.chat.completions.create(
        model=os.environ.get("groq_model", "openai/gpt-oss-120b"),
        messages=[
            {"role": "system", "content": SUMMARY_JUDGE_SYSTEM},
            {
                "role": "user",
                "content": f"=== FLAGS ===\n{flags_text}\n\n=== SUMMARY ===\n{report.reasoning_summary}",
            },
        ],
        response_format={
            "type": "json_schema",
            "json_schema": {"name": "summary_audit", "strict": True, "schema": SUMMARY_SCHEMA},
        },
        temperature=0.0,
    )
    return json.loads(resp.choices[0].message.content)


CALIBRATION_BUNDLE = """CAMPAIGN CMP-9999
Title: Water pumps for three villages
Organizer: Verified Example Trust (organization)
Goal: USD 5,000

--- org_registry ---
Result: VERIFIED
"Verified Example Trust" is registered with the Example Registry (EX-1234), active since 2015-01-01.

--- duplicate_check ---
No past campaign matched on image fingerprints or body text.

--- web_search ---
* Verified Example Trust annual report (https://example.org/report)
  Filed accounts for 2025. Three water projects completed.
"""

CALIBRATION_FLAGS = [
    {
        "type": "org_not_verified",
        "severity": "high",
        "source": "org_registry",
        "evidence": "The organization does not appear in the Example Registry and its "
        "registration EX-1234 was revoked in 2024 following an audit.",
        "planted": True,
    },
    {
        "type": "duplicate_content",
        "severity": "high",
        "source": "duplicate_check",
        "evidence": "Four images match campaign CMP-7777, which was rejected for fraud.",
        "planted": True,
    },
]


def run_calibration() -> tuple[int, int, list[str]]:
    """Feed the judge a report containing deliberate fabrications.

    A judge that rubber-stamps is worse than no judge, because it manufactures
    confidence. This proves it can fail something before its passes are trusted.
    """
    from groq import Groq

    flags_text = "\n".join(
        f"- type={f['type']} severity={f['severity']} source={f['source']}\n  evidence: {f['evidence']}"
        for f in CALIBRATION_FLAGS
    )
    client = Groq(api_key=os.environ["groq_api_key"])
    resp = client.chat.completions.create(
        model=os.environ.get("groq_model", "openai/gpt-oss-120b"),
        messages=[
            {"role": "system", "content": JUDGE_SYSTEM},
            {
                "role": "user",
                "content": (
                    f"=== EVIDENCE BUNDLE ===\n{CALIBRATION_BUNDLE}\n=== END BUNDLE ===\n\n"
                    f"=== FLAGS TO AUDIT ===\n{flags_text}\n\n"
                    "Return one verdict per flag, in order."
                ),
            },
        ],
        response_format={
            "type": "json_schema",
            "json_schema": {"name": "judge", "strict": True, "schema": JUDGE_SCHEMA},
        },
        temperature=0.0,
    )
    verdicts = json.loads(resp.choices[0].message.content)["verdicts"]
    caught = [v for v in verdicts if v["verdict"] != "supported"]
    notes = [f"{v['flag_type']}: {v['verdict']}" for v in verdicts]
    return len(caught), len(CALIBRATION_FLAGS), notes


# ------------------------------------------------------------------------ main


def load_reports(live: bool) -> dict[str, tuple[RiskReport | None, str, str]]:
    out: dict[str, tuple[RiskReport | None, str, str]] = {}

    if live:
        from ..agent.synthesis_llm import llm_synthesize

        for campaign in tools.load_campaigns():
            result, bundle = assess(campaign, llm_synthesize)
            report = result.report if result.status == "ok" else None
            out[campaign["campaign_id"]] = (report, bundle, result.status)
            time.sleep(1.5)
        return out

    if not SEED.exists():
        sys.exit(f"No seed at {SEED}. Run `uv run python -m app.build_seed` or pass --live.")

    for campaign_id, record in json.loads(SEED.read_text()).items():
        report = (
            RiskReport.model_validate(record["payload"]["report"])
            if record["status"] == "ok"
            else None
        )
        out[campaign_id] = (report, record["bundle"], record["status"])
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true", help="re-run the pipeline instead of using the seed")
    ap.add_argument("--no-judge", action="store_true", help="skip the LLM-as-judge layer")
    args = ap.parse_args()

    spec = json.loads(CASES.read_text())["cases"]
    reports = load_reports(args.live)

    print(f"\n{'CAMPAIGN':<11} {'CATEGORY':<19} {'RESULT':<7} DETAIL")
    print("-" * 100)

    passed, failed = 0, 0
    by_category: dict[str, list[bool]] = {}
    rows: list[tuple[str, list[str]]] = []

    for case in spec:
        campaign_id = case["campaign_id"]
        category = case["category"]
        report, _bundle, status = reports.get(campaign_id, (None, "", "missing"))

        if report is None:
            failures = [f"no assessment available (status={status})"]
        else:
            failures = structural_checks(report) + check_case(report, case["checks"])

        ok = not failures
        passed, failed = passed + ok, failed + (not ok)
        by_category.setdefault(category, []).append(ok)
        rows.append((campaign_id, failures))

        mark = f"{GREEN}PASS{RESET}" if ok else f"{RED}FAIL{RESET}"
        detail = "" if ok else failures[0]
        print(f"{campaign_id:<11} {category:<19} {mark:<16} {detail}")
        for extra in failures[1:]:
            print(f"{'':<11} {'':<19} {'':<7} {extra}")

    print("-" * 100)
    print(f"\nDETERMINISTIC   {passed}/{passed + failed} cases pass")
    for category, results in sorted(by_category.items()):
        n_ok = sum(results)
        label = "false positives" if category == "clean" else "pass"
        extra = (
            f"  ({len(results) - n_ok} false positive(s))"
            if category == "clean" and n_ok < len(results)
            else ""
        )
        print(f"  {category:<19} {n_ok}/{len(results)} {label}{extra}")

    judge_line = "skipped"
    calibration_line = "skipped"

    if not args.no_judge:
        print(f"\n{DIM}auditing flag grounding...{RESET}")
        caught, total_planted, notes = run_calibration()
        calibration_ok = caught == total_planted
        calibration_line = (
            f"{caught}/{total_planted} planted fabrications caught  [{'; '.join(notes)}]"
        )

        supported = unsupported = 0
        problems: list[str] = []
        summary_needed = {
            c["campaign_id"]
            for c in spec
            if c["checks"].get("summary_must_explain_mitigation")
        }
        summary_ok = summary_total = 0

        for campaign_id, (report, bundle, status) in reports.items():
            if report is None or not report.flags:
                continue
            for v in judge(report, bundle):
                if v["verdict"] == "supported":
                    supported += 1
                else:
                    unsupported += 1
                    problems.append(
                        f"  {campaign_id} {v['flag_type']}: {v['verdict']} — {v['reason'][:110]}"
                    )

            if campaign_id in summary_needed:
                audit = judge_summary(report)
                summary_total += 1
                if audit["verdict"] == "explains":
                    summary_ok += 1
                else:
                    problems.append(
                        f"  {campaign_id} summary: {audit['verdict']} — {audit['reason'][:110]}"
                    )
            time.sleep(1.0)

        total_flags = supported + unsupported
        pct = 100 * supported / total_flags if total_flags else 100.0
        judge_line = f"{supported}/{total_flags} flags judged supported ({pct:.0f}%)"

        print(f"\nLLM-AS-JUDGE    {judge_line}")
        if summary_total:
            print(
                f"SUMMARY AUDIT   {summary_ok}/{summary_total} ambiguous-case summaries "
                f"explain their flags rather than naming them"
            )
        print(f"CALIBRATION     {calibration_line}")
        if not calibration_ok:
            print(
                f"  {RED}The judge failed to catch a planted fabrication. Treat its "
                f"passes as unreliable until this is fixed.{RESET}"
            )
        for p in problems:
            print(f"{YELLOW}{p}{RESET}")

    print(
        f"\n{DIM}Judge and synthesis share one model "
        f"({os.environ.get('groq_model', 'openai/gpt-oss-120b')}), so self-preference bias "
        f"applies. Stated, not corrected for.{RESET}"
    )
    print(
        f"{DIM}Human agreement rate is deliberately not reported here. With a handful of "
        f"decisions from the one reviewer who wrote these labels, it would be an anecdote. "
        f"It is defined in the decision log as the production drift signal.{RESET}"
    )

    verdict_ok = failed == 0
    print(
        f"\n{GREEN if verdict_ok else RED}{'PASS' if verdict_ok else 'FAIL'}{RESET}  "
        f"{passed} passed, {failed} failed\n"
    )
    return 0 if verdict_ok else 1


if __name__ == "__main__":
    sys.exit(main())

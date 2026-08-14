"""Phase 0 spike: does Groq strict json_schema mode hold up against the real RiskReport shape?

Run: uv run python spike_structured_output.py
Throwaway. Deleted once graph.py exercises the same path.
"""

import json
import os
from enum import Enum
from typing import Literal

from dotenv import load_dotenv
from groq import Groq
from pydantic import BaseModel, ConfigDict, Field, ValidationError

load_dotenv(dotenv_path="../.env")

MODEL = os.environ["groq_model"]
client = Groq(api_key=os.environ["groq_api_key"])


class FlagType(str, Enum):
    org_not_verified = "org_not_verified"
    duplicate_content = "duplicate_content"
    high_ask_no_track_record = "high_ask_no_track_record"
    inconsistent_claims = "inconsistent_claims"
    suspicious_media = "suspicious_media"
    other = "other"


class Severity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class Source(str, Enum):
    campaign_text = "campaign_text"
    org_registry = "org_registry"
    duplicate_check = "duplicate_check"
    web_search = "web_search"


class Flag(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: FlagType
    severity: Severity
    evidence: str = Field(description="What specifically triggered this, quoting the source.")
    source: Source


class RiskReport(BaseModel):
    model_config = ConfigDict(extra="forbid")
    campaign_id: str
    flags: list[Flag]
    recommendation: Literal["approve", "manual_review", "reject"]
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning_summary: str


EVIDENCE_BUNDLE = """
CAMPAIGN CMP-4471
Title: Emergency shelter for flood victims - Sindh
Organizer: Alamgir Relief Trust
Goal: USD 45,000
Body: "Our trust has been serving flood-affected families in Sindh for over a decade.
Funds will provide tents, clean water and food for 300 families."
Claimed location: Sindh, Pakistan

--- org_registry ---
Query "Alamgir Relief Trust": NO MATCH across 3 mock national NGO registries.
Prior campaigns on file under this organizer name: 0

--- duplicate_check ---
3 of 5 submitted images match images from CMP-3108 at similarity 0.94.
CMP-3108 status: REJECTED (April, unverifiable claims).

--- web_search ---
No independent corroboration found for "Alamgir Relief Trust".

--- platform_stats ---
Median first-time-organizer ask, trailing 90 days: USD 7,500.
This ask is 6.0x that median.
"""

SYSTEM = """You are a trust & safety analyst for a crowdfunding platform.

You will be given an evidence bundle assembled by automated checks. Produce a risk report.

HARD RULES:
- Every flag must be supported by something explicitly present in the evidence bundle.
- The `evidence` field must quote or directly reference the specific bundle content that triggered the flag. Never write a flag you cannot ground.
- `source` must name the bundle section the evidence came from.
- Do not invent facts. If the bundle does not say it, it did not happen.
- You recommend. You never decide. A human reviewer makes the final call."""


def main() -> None:
    schema = RiskReport.model_json_schema()
    print("--- schema sent (note $defs/$ref nesting) ---")
    print(json.dumps(schema)[:300], "...\n")

    resp = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": EVIDENCE_BUNDLE},
        ],
        response_format={
            "type": "json_schema",
            "json_schema": {"name": "risk_report", "strict": True, "schema": schema},
        },
        temperature=0.2,
    )

    raw = resp.choices[0].message.content
    print("--- raw ---")
    print(raw, "\n")

    try:
        report = RiskReport.model_validate_json(raw)
    except ValidationError as e:
        print("FAIL: pydantic rejected the model output")
        print(e)
        raise SystemExit(1)

    print("--- validated ---")
    print(f"recommendation : {report.recommendation}")
    print(f"confidence     : {report.confidence}")
    print(f"flags          : {len(report.flags)}")
    for f in report.flags:
        print(f"  [{f.severity.value:6}] {f.type.value:26} src={f.source.value}")
        print(f"           {f.evidence}")
    print(f"\nsummary: {report.reasoning_summary}")

    u = resp.usage
    print(f"\n--- cost ---\nprompt={u.prompt_tokens} completion={u.completion_tokens} total={u.total_tokens}")
    print(f"latency={u.total_time:.2f}s")
    print("\nPASS")


if __name__ == "__main__":
    main()

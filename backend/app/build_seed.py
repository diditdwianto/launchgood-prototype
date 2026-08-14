"""Regenerate the committed assessment seed.

    uv run python -m app.build_seed

Runs the real pipeline over every mock campaign and writes the results to
data/seed_assessments.json. Paced deliberately: Groq's free tier rate-limits
bursts, and a partial seed is worse than a slow one.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()
load_dotenv(dotenv_path="../.env")

from .agent import tools  # noqa: E402
from .agent.graph import assess  # noqa: E402
from .agent.synthesis_llm import llm_synthesize, usage  # noqa: E402

OUT = Path(__file__).resolve().parent / "data" / "seed_assessments.json"


def main() -> int:
    seed: dict[str, dict] = {}
    failures: list[str] = []

    for campaign in tools.load_campaigns():
        campaign_id = campaign["campaign_id"]
        result, bundle = assess(campaign, llm_synthesize)
        seed[campaign_id] = {
            "status": result.status,
            "payload": result.model_dump(mode="json"),
            "bundle": bundle,
        }

        if result.status == "ok":
            r = result.report
            print(
                f"{campaign_id}  {r.risk_score:>3}  {r.risk_tier.value:<6} "
                f"{r.recommendation:<13} conf={r.confidence:.2f}  flags={len(r.flags)}"
            )
        else:
            failures.append(campaign_id)
            print(f"{campaign_id}  FAILED  {result.error.message[:90]}")

        time.sleep(1.5)

    if failures:
        print(f"\nRefusing to write a partial seed. Failed: {', '.join(failures)}")
        return 1

    OUT.write_text(json.dumps(seed, indent=2))
    print(f"\nWrote {len(seed)} assessments to {OUT.relative_to(Path.cwd())}")
    print(f"usage: {usage.summary()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

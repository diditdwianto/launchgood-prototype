"""Regenerate the committed assessment seed.

    uv run python -m app.build_seed                 # assess every campaign
    uv run python -m app.build_seed --retry-failed  # only the ones that errored

Runs the real pipeline over the mock campaigns and merges the results into
data/seed_assessments.json. Paced deliberately: Groq rate-limits bursts.

Results merge rather than replace, and a run that leaves failures still writes what
it got and exits nonzero. Daily token quotas are the binding constraint here, so
re-running thirteen good assessments to fix one straggler is the expensive way to
do it — `--retry-failed` costs one call instead of fourteen.
"""

from __future__ import annotations

import argparse
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
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--retry-failed",
        action="store_true",
        help="only re-assess campaigns missing or errored in the existing seed",
    )
    args = ap.parse_args()

    # Merge into whatever is already there rather than starting empty. Daily token
    # quotas are the binding constraint, so re-running thirteen good assessments to
    # fix one straggler is the expensive way to do it.
    seed: dict[str, dict] = json.loads(OUT.read_text()) if OUT.exists() else {}
    failures: list[str] = []

    campaigns = tools.load_campaigns()
    if args.retry_failed:
        campaigns = [
            c
            for c in campaigns
            if seed.get(c["campaign_id"], {}).get("status") != "ok"
        ]
        if not campaigns:
            print("Every campaign in the seed already assessed cleanly. Nothing to do.")
            return 0
        print(f"Retrying {len(campaigns)}: {', '.join(c['campaign_id'] for c in campaigns)}\n")

    for campaign in campaigns:
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

    # Always write. A failed assessment is a first-class outcome the UI renders as a
    # triage card and sorts above scored campaigns, so a seed containing one is
    # coherent — and discarding thirteen good results to avoid it wastes quota that
    # is hard to get back. The nonzero exit is what flags it, not a refusal to save.
    OUT.write_text(json.dumps(seed, indent=2))
    ok = sum(1 for v in seed.values() if v["status"] == "ok")
    print(f"\nWrote {len(seed)} assessments ({ok} ok) to {OUT.relative_to(Path.cwd())}")
    print(f"usage: {usage.summary()}")

    if failures:
        print(f"\nStill failing: {', '.join(failures)}")
        print("Re-run just those with:  uv run python -m app.build_seed --retry-failed")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

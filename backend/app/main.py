"""FastAPI surface for the reviewer console."""

from __future__ import annotations

import json
import os
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import db
from .agent import scoring, tools
from .agent.graph import assess
from .agent.schemas import Decision

load_dotenv()
load_dotenv(dotenv_path="../.env")


def _synthesizer():
    """Real model call when a key is present, deterministic stub otherwise.

    Keeps the app runnable and the frontend demoable with no credentials at all.
    """
    if os.environ.get("groq_api_key") and os.environ.get("synthesizer") != "stub":
        from .agent.synthesis_llm import llm_synthesize

        return llm_synthesize
    from .agent.synthesis import stub_synthesize

    return stub_synthesize


SEED_FILE = Path(__file__).resolve().parent / "data" / "seed_assessments.json"


def assess_one(campaign: dict) -> None:
    result, bundle = assess(campaign, _synthesizer())
    db.save_assessment(
        campaign["campaign_id"], result.status, result.model_dump(mode="json"), bundle
    )


def seed() -> None:
    """Load pre-computed assessments so the queue is populated the instant the
    service starts, with no empty state and no cold-start dependency on the model API.

    Regenerate with `uv run python -m app.build_seed`. The live pipeline stays
    demonstrable through POST /reassess, which re-runs a single campaign for real.
    This keeps a recorded walkthrough from resting on fourteen cold API calls all
    landing inside a free tier's rate limit.
    """
    db.init(reset=True)

    if SEED_FILE.exists() and os.environ.get("reassess_on_start") != "1":
        for campaign_id, record in json.loads(SEED_FILE.read_text()).items():
            db.save_assessment(
                campaign_id, record["status"], record["payload"], record["bundle"]
            )
        return

    with ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(assess_one, tools.load_campaigns()))


@asynccontextmanager
async def lifespan(app: FastAPI):
    seed()
    yield
    db.close()


app = FastAPI(title="Campaign Trust & Compliance Copilot", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in os.environ.get("cors_origins", "*").split(",") if o],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    from .agent import synthesis_llm

    return {
        "ok": True,
        "synthesizer": _synthesizer().__name__,
        "search_provider": tools.get_search_provider().name,
        "database": db.backend(),
        "assessed": len(db.all_assessments()),
        "model_chain": synthesis_llm.model_chain(),
        "active_model": synthesis_llm.model_name(),
        # Non-empty means a model ran out of quota and the chain moved on. Surfaced
        # so nobody reads output from a model they did not choose.
        "exhausted_models": sorted(synthesis_llm._exhausted),
        "usage": synthesis_llm.usage.summary(),
        # Scraped from response headers. Per-minute figures are live; the per-day
        # quota appears only in the text of the 429 that announces it, so it shows
        # up here after a model has been exhausted, not before.
        "rate_limits": synthesis_llm.rate_limits(),
    }


@app.get("/api/queue")
def queue() -> dict:
    decided = db.decided_ids()
    campaigns = {c["campaign_id"]: c for c in tools.load_campaigns()}
    items = []

    for campaign_id, record in db.all_assessments().items():
        campaign = campaigns.get(campaign_id)
        if campaign is None:
            continue
        payload = record["payload"]
        report = payload.get("report") or {}
        items.append(
            {
                "campaign_id": campaign_id,
                "title": campaign["title"],
                "organizer_name": campaign["organizer_name"],
                "goal_usd": campaign["goal_usd"],
                "submitted_at": campaign["submitted_at"],
                "status": record["status"],
                "risk_score": report.get("risk_score"),
                "risk_tier": report.get("risk_tier"),
                "recommendation": report.get("recommendation"),
                "flag_count": len(report.get("flags", [])),
                "decided": campaign_id in decided,
            }
        )

    # Errors first — a submission the pipeline could not assess needs a human
    # sooner than one it scored as low risk.
    items.sort(key=lambda i: (i["status"] != "error", -(i["risk_score"] or 0)))
    return {"items": items, "scoring": scoring.explain()}


@app.get("/api/campaigns/{campaign_id}")
def campaign_detail(campaign_id: str) -> dict:
    campaign = tools.get_campaign(campaign_id)
    record = db.get_assessment(campaign_id)
    if campaign is None or record is None:
        raise HTTPException(status_code=404, detail="campaign not found")

    return {
        "campaign": campaign,
        "assessment": record["payload"],
        "evidence_bundle": record["bundle"],
        "assessed_at": record["assessed_at"],
        "scoring": scoring.explain(),
        "decided": campaign_id in db.decided_ids(),
    }


class DecisionRequest(BaseModel):
    decision: Decision
    reviewer_note: str = ""


@app.post("/api/campaigns/{campaign_id}/decision")
def decide(campaign_id: str, body: DecisionRequest) -> dict:
    record = db.get_assessment(campaign_id)
    if record is None:
        raise HTTPException(status_code=404, detail="campaign not found")
    if record["status"] != "ok":
        raise HTTPException(status_code=409, detail="cannot decide on a failed assessment")

    from .agent.schemas import RiskReport

    report = RiskReport.model_validate(record["payload"]["report"])
    entry = db.record_decision(report, body.decision, body.reviewer_note)
    return {"logged": entry.model_dump(mode="json")}


@app.post("/api/campaigns/{campaign_id}/reassess")
def reassess(campaign_id: str) -> dict:
    """Re-run the full pipeline live against the model, for this one campaign."""
    campaign = tools.get_campaign(campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="campaign not found")

    assess_one(campaign)
    record = db.get_assessment(campaign_id)
    return {"assessment": record["payload"], "assessed_at": record["assessed_at"]}


@app.get("/api/decisions")
def decision_log() -> dict:
    entries = db.decisions()
    counts = db.outcome_counts()
    agreed = counts.get("agreed", 0)
    decisive = agreed + counts.get("overrode", 0)
    return {
        "entries": [e.model_dump(mode="json") for e in entries],
        "total": len(entries),
        # Reported as a fraction, never as a headline percentage. A handful of
        # decisions from one reviewer who also wrote the labels is an anecdote,
        # not an agreement rate. It is here as the shape of the production
        # monitoring signal, not as a result.
        "agreement": f"{agreed}/{decisive}",
        "deferred": counts.get("deferred", 0),
    }

"""FastAPI surface for the reviewer console."""

from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

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


def seed() -> None:
    """Assess every campaign on startup so the reviewer never hits an empty queue.

    Run concurrently: fourteen sequential model calls would make cold start
    unpleasant, especially on a free-tier host.
    """
    db.init(reset=True)
    synthesize = _synthesizer()
    campaigns = tools.load_campaigns()

    def one(campaign: dict) -> None:
        result, bundle = assess(campaign, synthesize)
        db.save_assessment(
            campaign["campaign_id"], result.status, result.model_dump(mode="json"), bundle
        )

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(one, campaigns))


@asynccontextmanager
async def lifespan(app: FastAPI):
    seed()
    yield


app = FastAPI(title="Campaign Trust & Compliance Copilot", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in os.environ.get("cors_origins", "*").split(",") if o],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {
        "ok": True,
        "synthesizer": _synthesizer().__name__,
        "search_provider": tools.get_search_provider().name,
        "assessed": len(db.all_assessments()),
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


@app.get("/api/decisions")
def decision_log() -> dict:
    entries = db.decisions()
    decisive = [e for e in entries if e.outcome != "deferred"]
    agreed = [e for e in decisive if e.outcome == "agreed"]
    return {
        "entries": [e.model_dump(mode="json") for e in entries],
        "total": len(entries),
        # Reported as a fraction, never as a headline percentage. A handful of
        # decisions from one reviewer who also wrote the labels is an anecdote,
        # not an agreement rate. It is here as the shape of the production
        # monitoring signal, not as a result.
        "agreement": f"{len(agreed)}/{len(decisive)}",
        "deferred": len(entries) - len(decisive),
    }

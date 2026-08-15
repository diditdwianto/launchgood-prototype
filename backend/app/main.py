"""FastAPI surface for the reviewer console."""

from __future__ import annotations

import json
import os
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field

from . import auth, db
from .agent import scoring, tools
from .agent.graph import assess, assess_stream
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


def all_campaigns() -> list[dict]:
    """Fixtures plus anything submitted through the console.

    Kept separate at rest — the fixtures are versioned test data the eval suite reads
    expected outcomes against — but merged for everything the reviewer sees.
    """
    return tools.load_campaigns() + db.submitted_campaigns()


def find_campaign(campaign_id: str) -> dict | None:
    return next((c for c in all_campaigns() if c["campaign_id"] == campaign_id), None)


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


# Everything under /api is authenticated unless listed here. An allowlist rather than
# per-route dependencies so that adding an endpoint cannot accidentally add an
# unprotected one — the failure mode of forgetting is a locked door, not an open one.
PUBLIC_PATHS = {"/api/health", "/api/auth/login", "/api/telemetry"}


@app.middleware("http")
async def require_auth(request: Request, call_next):
    path = request.url.path
    if (
        not path.startswith("/api")
        or path in PUBLIC_PATHS
        or request.method == "OPTIONS"  # CORS preflight carries no Authorization header
    ):
        return await call_next(request)

    header = request.headers.get("authorization", "")
    token = header[7:].strip() if header.lower().startswith("bearer ") else ""
    # SSE cannot set headers through EventSource, so a token query param is accepted
    # for streaming endpoints only.
    if not token and path.endswith("/stream"):
        token = request.query_params.get("token", "")

    if auth.read_token(token) is None:
        return JSONResponse({"detail": "not authenticated"}, status_code=401)
    return await call_next(request)


class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/api/auth/login")
def login(body: LoginRequest) -> dict:
    user = auth.authenticate(body.username, body.password)
    if user is None:
        # One message for both "no such user" and "wrong password": distinguishing
        # them tells an attacker which usernames are real.
        raise HTTPException(status_code=401, detail="incorrect username or password")
    return {"token": auth.issue_token(user["username"]), "user": user}


@app.get("/api/auth/me")
def me(username: str = Depends(auth.current_user)) -> dict:
    return {"username": username}


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
    campaigns = {c["campaign_id"]: c for c in all_campaigns()}
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
    campaign = find_campaign(campaign_id)
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
    campaign = find_campaign(campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="campaign not found")

    assess_one(campaign)
    record = db.get_assessment(campaign_id)
    return {"assessment": record["payload"], "assessed_at": record["assessed_at"]}


class NewCampaign(BaseModel):
    title: str = Field(min_length=4, max_length=200)
    organizer_name: str = Field(min_length=2, max_length=120)
    organizer_type: Literal["organization", "individual"] = "organization"
    goal_usd: int = Field(ge=1, le=10_000_000)
    claimed_location: str = Field(min_length=2, max_length=120)
    category: str = Field(default="other", max_length=60)
    # Capped: this text goes into a model prompt, so its length is a cost and a
    # prompt-injection surface, not just a form field.
    body: str = Field(min_length=20, max_length=4000)
    organizer_account_age_days: int = Field(default=1, ge=0, le=20000)
    prior_campaigns_on_platform: int = Field(default=0, ge=0, le=1000)


@app.post("/api/campaigns")
def submit_campaign(body: NewCampaign, username: str = Depends(auth.current_user)) -> dict:
    """Accept a campaign. Assessment is a separate, streamed call."""
    campaign = body.model_dump()
    campaign["campaign_id"] = db.next_campaign_id()
    campaign["submitted_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    campaign["images"] = []  # no upload path yet; media checks degrade honestly
    # Marks this as a real submission rather than a fixture, which is what unlocks
    # live web search — see tools.search_provider_for.
    campaign["origin"] = "submitted"
    db.save_campaign(campaign, username)
    return {"campaign": campaign}


@app.get("/api/campaigns/{campaign_id}/assess/stream")
def assess_streaming(campaign_id: str):
    """Server-sent events, one per pipeline node, then the finished report.

    The pipeline always ran node by node. Streaming stops hiding that, which is the
    difference between a verdict appearing fully formed and a reviewer watching the
    evidence actually being gathered.
    """
    campaign = find_campaign(campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="campaign not found")

    def events():
        def sse(event: str, data: dict) -> str:
            return f"event: {event}\ndata: {json.dumps(data)}\n\n"

        try:
            bundle = ""
            result = None
            for kind, payload in assess_stream(campaign, _synthesizer()):
                if kind == "node":
                    yield sse("node", payload.model_dump(mode="json"))
                elif kind == "result":
                    result = payload
                elif kind == "bundle":
                    bundle = payload

            if result is not None:
                db.save_assessment(
                    campaign_id, result.status, result.model_dump(mode="json"), bundle
                )
                yield sse("result", result.model_dump(mode="json"))
        except Exception as exc:  # noqa: BLE001
            # A stream that dies silently looks identical to one still working, so
            # failures are sent as an event rather than dropped on the floor.
            yield sse("failed", {"message": f"{type(exc).__name__}: {exc}"})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/telemetry")
def telemetry(request: Request, probe: bool = False) -> dict:
    """What this console is actually running on. Readable without signing in, so the
    system can be inspected without being handed the keys to it.

    Probing is the exception. Groq only discloses limits on a response, so refreshing
    them spends tokens — an anonymous endpoint that did that on request would be a
    quota drain with a button on it. Anonymous callers get the cached snapshot.
    """
    from .agent import registries, synthesis_llm

    header = request.headers.get("authorization", "")
    signed_in = bool(
        header.lower().startswith("bearer ")
        and auth.read_token(header[7:].strip())
    )

    if probe and signed_in:
        synthesis_llm.probe_limits()

    data = synthesis_llm.telemetry()
    provider = tools.get_search_provider().name
    data["search"] = {
        "provider": f"{provider} (submitted campaigns) · mock (fixtures)"
        if provider != "mock"
        else "mock",
        "live": provider != "mock",
    }
    data["registries"] = [
        {"name": p.name, "covers_example": "United States" if p.name == "propublica" else "United Kingdom"}
        for p in registries.live_providers()
    ]
    # The backend string carries host, port and database name. Fine for a signed-in
    # reviewer, needless exposure to an anonymous one.
    data["provider"] = " + ".join(data.pop("providers", []))
    data["database"] = db.backend() if signed_in else "postgres"
    data["signed_in"] = signed_in
    data["probe_available"] = signed_in
    data["scoring"] = scoring.explain()
    data["captured_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    return data


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

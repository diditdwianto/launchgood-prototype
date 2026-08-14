"""Decision log and assessment cache. SQLite via stdlib — no ORM, no migrations.

The decision log is the point of the whole system. It is also the eval data:
disagreement between the AI recommendation and the human decision is the signal
worth monitoring in production to catch drift and systematic blind spots.
"""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .agent.schemas import Decision, DecisionLogEntry, RiskReport

DB_PATH = Path(os.environ.get("db_path", "/tmp/trust_copilot.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS assessments (
    campaign_id TEXT PRIMARY KEY,
    status      TEXT NOT NULL,
    payload     TEXT NOT NULL,
    bundle      TEXT NOT NULL,
    assessed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS decisions (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id       TEXT NOT NULL,
    ai_recommendation TEXT NOT NULL,
    ai_confidence     REAL NOT NULL,
    ai_risk_score     INTEGER NOT NULL,
    human_decision    TEXT NOT NULL,
    outcome           TEXT NOT NULL,
    reviewer_note     TEXT NOT NULL DEFAULT '',
    decided_at        TEXT NOT NULL
);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init(reset: bool = False) -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        conn.executescript(SCHEMA)
        if reset:
            conn.execute("DELETE FROM assessments")
            conn.execute("DELETE FROM decisions")


def save_assessment(campaign_id: str, status: str, payload: dict, bundle: str) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO assessments VALUES (?,?,?,?,?)",
            (campaign_id, status, json.dumps(payload), bundle, _now()),
        )


def get_assessment(campaign_id: str) -> dict | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM assessments WHERE campaign_id = ?", (campaign_id,)
        ).fetchone()
    if row is None:
        return None
    return {
        "status": row["status"],
        "payload": json.loads(row["payload"]),
        "bundle": row["bundle"],
        "assessed_at": row["assessed_at"],
    }


def all_assessments() -> dict[str, dict]:
    with connect() as conn:
        rows = conn.execute("SELECT * FROM assessments").fetchall()
    return {
        r["campaign_id"]: {
            "status": r["status"],
            "payload": json.loads(r["payload"]),
            "assessed_at": r["assessed_at"],
        }
        for r in rows
    }


# --------------------------------------------------------------------- decisions

def classify_outcome(recommendation: str, human_decision: str) -> str:
    """`manual_review` is a deferral, not a prediction.

    Counting "AI said manual_review, human rejected" as a disagreement would be
    wrong — the AI asked a human to decide and a human decided, which is the
    system working. Counting it as agreement would be worse, since it would let
    the model score perfectly by never committing to anything. Deferrals are
    therefore excluded from the agreement rate and tracked on their own.
    """
    if recommendation == "manual_review":
        return "deferred"
    return "agreed" if recommendation == human_decision else "overrode"


def record_decision(
    report: RiskReport, human_decision: Decision, reviewer_note: str = ""
) -> DecisionLogEntry:
    entry = DecisionLogEntry(
        campaign_id=report.campaign_id,
        ai_recommendation=report.recommendation,
        ai_confidence=report.confidence,
        ai_risk_score=report.risk_score,
        human_decision=human_decision,
        outcome=classify_outcome(report.recommendation, human_decision),
        reviewer_note=reviewer_note,
        decided_at=_now(),
    )
    with connect() as conn:
        conn.execute(
            "INSERT INTO decisions (campaign_id, ai_recommendation, ai_confidence,"
            " ai_risk_score, human_decision, outcome, reviewer_note, decided_at)"
            " VALUES (?,?,?,?,?,?,?,?)",
            (
                entry.campaign_id,
                entry.ai_recommendation,
                entry.ai_confidence,
                entry.ai_risk_score,
                entry.human_decision,
                entry.outcome,
                entry.reviewer_note,
                entry.decided_at,
            ),
        )
    return entry


def decisions() -> list[DecisionLogEntry]:
    with connect() as conn:
        rows = conn.execute("SELECT * FROM decisions ORDER BY id DESC").fetchall()
    return [
        DecisionLogEntry(
            campaign_id=r["campaign_id"],
            ai_recommendation=r["ai_recommendation"],
            ai_confidence=r["ai_confidence"],
            ai_risk_score=r["ai_risk_score"],
            human_decision=r["human_decision"],
            outcome=r["outcome"],
            reviewer_note=r["reviewer_note"],
            decided_at=r["decided_at"],
        )
        for r in rows
    ]


def decided_ids() -> set[str]:
    with connect() as conn:
        return {r["campaign_id"] for r in conn.execute("SELECT DISTINCT campaign_id FROM decisions")}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")

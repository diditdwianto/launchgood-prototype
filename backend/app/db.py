"""Decision log and assessment cache.

The decision log is the point of the whole system. It is also the eval data:
disagreement between the AI recommendation and the human decision is the signal
worth monitoring in production to catch drift and systematic blind spots.

Two backends, chosen by whether `database_url` is set:

- **SQLite** (default) — zero setup, right for local work and for anyone cloning this.
- **Postgres** — used when `database_url` is present.

The reason for Postgres here is persistence, not scale. On a free-tier host the disk
is ephemeral, so a SQLite file is wiped on every restart and redeploy, taking the
decision log with it. Losing the log means losing the one thing this system produces
that a human actually authored.

Deliberately a thin dialect shim rather than an ORM: two tables, no relations, no
migrations. An ORM here would be more code to read, not less.
"""

from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from .agent.schemas import Decision, DecisionLogEntry, RiskReport

DATABASE_URL = os.environ.get("database_url") or os.environ.get("DATABASE_URL")
IS_POSTGRES = bool(DATABASE_URL)

DB_PATH = Path(os.environ.get("db_path", "/tmp/trust_copilot.db"))

# The only DDL that genuinely differs. Both engines support `ON CONFLICT DO UPDATE`,
# so the upsert below is shared rather than branched.
_SERIAL = "SERIAL PRIMARY KEY" if IS_POSTGRES else "INTEGER PRIMARY KEY AUTOINCREMENT"

SCHEMA = f"""
CREATE TABLE IF NOT EXISTS assessments (
    campaign_id TEXT PRIMARY KEY,
    status      TEXT NOT NULL,
    payload     TEXT NOT NULL,
    bundle      TEXT NOT NULL,
    assessed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS decisions (
    id                {_SERIAL},
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

_pool = None


def _get_pool():
    """Pooled because seeding runs assessments concurrently; a bare connect-per-call
    against a remote Postgres would pay the handshake on every write."""
    global _pool
    if _pool is None:
        from psycopg_pool import ConnectionPool
        from psycopg.rows import dict_row

        _pool = ConnectionPool(
            DATABASE_URL, min_size=1, max_size=8, kwargs={"row_factory": dict_row}
        )
    return _pool


def _q(sql: str) -> str:
    """SQLite takes `?` placeholders, Postgres takes `%s`. Queries are written once
    with `?` and translated here."""
    return sql.replace("?", "%s") if IS_POSTGRES else sql


@contextmanager
def connect():
    """Yields a connection that commits on clean exit, for either backend."""
    if IS_POSTGRES:
        with _get_pool().connection() as conn:
            yield conn
        return

    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def _rows(conn, sql: str, params: tuple = ()) -> list[dict]:
    cur = conn.execute(_q(sql), params)
    return [dict(r) for r in cur.fetchall()]


def _execute(conn, sql: str, params: tuple = ()) -> None:
    conn.execute(_q(sql), params)


def close() -> None:
    """Shut the pool down explicitly.

    Left to the garbage collector, psycopg_pool tries to join its worker threads
    during interpreter finalization and raises PythonFinalizationError — harmless,
    but it lands in the logs on every shutdown looking like a real fault.
    """
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


def backend() -> str:
    return "postgres" if IS_POSTGRES else f"sqlite ({DB_PATH})"


def init(reset: bool = False) -> None:
    if not IS_POSTGRES:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    with connect() as conn:
        conn.execute(SCHEMA) if IS_POSTGRES else conn.executescript(SCHEMA)
        if reset:
            # Assessments are a cache and are rebuilt from the seed on every start.
            # Decisions are human work and are never dropped — on Postgres they are
            # the whole reason the database is there.
            _execute(conn, "DELETE FROM assessments")
            if not IS_POSTGRES:
                _execute(conn, "DELETE FROM decisions")


def save_assessment(campaign_id: str, status: str, payload: dict, bundle: str) -> None:
    with connect() as conn:
        _execute(
            conn,
            "INSERT INTO assessments (campaign_id, status, payload, bundle, assessed_at)"
            " VALUES (?,?,?,?,?)"
            " ON CONFLICT (campaign_id) DO UPDATE SET"
            "   status = excluded.status,"
            "   payload = excluded.payload,"
            "   bundle = excluded.bundle,"
            "   assessed_at = excluded.assessed_at",
            (campaign_id, status, json.dumps(payload), bundle, _now()),
        )


def get_assessment(campaign_id: str) -> dict | None:
    with connect() as conn:
        rows = _rows(conn, "SELECT * FROM assessments WHERE campaign_id = ?", (campaign_id,))
    if not rows:
        return None
    row = rows[0]
    return {
        "status": row["status"],
        "payload": json.loads(row["payload"]),
        "bundle": row["bundle"],
        "assessed_at": row["assessed_at"],
    }


def all_assessments() -> dict[str, dict]:
    with connect() as conn:
        rows = _rows(conn, "SELECT * FROM assessments")
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
        _execute(
            conn,
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
        rows = _rows(conn, "SELECT * FROM decisions ORDER BY id DESC")
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
        return {r["campaign_id"] for r in _rows(conn, "SELECT DISTINCT campaign_id FROM decisions")}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")

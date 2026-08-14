"""Decision log and assessment cache, on Postgres.

The decision log is the point of the whole system. It is also the eval data:
disagreement between the AI recommendation and the human decision is the signal
worth monitoring in production to catch drift and systematic blind spots. It is the
one table here that nobody can regenerate, which is what drives most of the choices
below.

Postgres rather than SQLite because free-tier hosts have ephemeral disks — a SQLite
file is wiped on every restart and redeploy, taking that log with it.

**Why raw psycopg and not an ORM.** Two tables, no relations, and the interesting
work lives in constraints and indexes rather than in object mapping. SQLAlchemy would
add a layer over queries that are worth reading directly, and Alembic would add a
dependency and a config tree to manage two files' worth of DDL. Migrations are
numbered `.sql` files applied in order and recorded in `schema_migrations`, which is
the part of Alembic that actually matters here. If this grew relations or a team, the
tradeoff would flip.
"""

from __future__ import annotations

import logging
import os
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

from .agent.schemas import Decision, DecisionLogEntry, RiskReport

logger = logging.getLogger(__name__)

DEFAULT_URL = "postgresql://trustcopilot:dev@localhost:55432/trustcopilot"
MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"


def database_url() -> str:
    return os.environ.get("database_url") or os.environ.get("DATABASE_URL") or DEFAULT_URL


_pool: ConnectionPool | None = None


def _get_pool() -> ConnectionPool:
    """Pooled because seeding assesses campaigns concurrently, and because a managed
    Postgres is a network hop — paying the connection handshake per query would show."""
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            database_url(),
            min_size=1,
            max_size=8,
            open=True,
            kwargs={"row_factory": dict_row},
        )
    return _pool


@contextmanager
def connect():
    with _get_pool().connection() as conn:
        yield conn


def close() -> None:
    """Shut the pool down explicitly.

    Left to the garbage collector, psycopg_pool joins its worker threads during
    interpreter finalization and raises PythonFinalizationError — harmless, but it
    lands in the logs on every shutdown looking like a real fault.
    """
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


def backend() -> str:
    # Never render the URL: it carries the password.
    url = database_url()
    return f"postgres ({url.rsplit('@', 1)[-1]})"


# ------------------------------------------------------------------- migrations


def migrate() -> list[str]:
    """Apply any migrations this database has not seen, in filename order.

    Each runs in its own transaction, so a failure leaves the database on the last
    good version rather than half-applied.
    """
    applied: list[str] = []

    with connect() as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            " version TEXT PRIMARY KEY,"
            " applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
        )
        rows = conn.execute("SELECT version FROM schema_migrations").fetchall()
        done = {r["version"] for r in rows}

    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        if path.name in done:
            continue
        with connect() as conn:
            conn.execute(path.read_text())
            conn.execute(
                "INSERT INTO schema_migrations (version) VALUES (%s)", (path.name,)
            )
        applied.append(path.name)
        logger.info("applied migration %s", path.name)

    return applied


def init(reset: bool = False) -> None:
    migrate()
    if reset:
        # Assessments are a cache, rebuilt from the seed on every boot. Decisions are
        # human work and are never dropped — persisting them is the entire reason this
        # runs on Postgres.
        with connect() as conn:
            conn.execute("TRUNCATE TABLE assessments")


# ------------------------------------------------------------------ assessments


def save_assessment(campaign_id: str, status: str, payload: dict, bundle: str) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO assessments (campaign_id, status, payload, bundle, assessed_at)"
            " VALUES (%s, %s, %s, %s, now())"
            " ON CONFLICT (campaign_id) DO UPDATE SET"
            "   status = EXCLUDED.status,"
            "   payload = EXCLUDED.payload,"
            "   bundle = EXCLUDED.bundle,"
            "   assessed_at = EXCLUDED.assessed_at",
            (campaign_id, status, Jsonb(payload), bundle),
        )


def get_assessment(campaign_id: str) -> dict | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM assessments WHERE campaign_id = %s", (campaign_id,)
        ).fetchone()
    if row is None:
        return None
    return {
        "status": row["status"],
        "payload": row["payload"],  # JSONB comes back already decoded
        "bundle": row["bundle"],
        "assessed_at": _iso(row["assessed_at"]),
    }


def all_assessments() -> dict[str, dict]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT campaign_id, status, payload, assessed_at FROM assessments"
        ).fetchall()
    return {
        r["campaign_id"]: {
            "status": r["status"],
            "payload": r["payload"],
            "assessed_at": _iso(r["assessed_at"]),
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
    outcome = classify_outcome(report.recommendation, human_decision)

    with connect() as conn:
        row = conn.execute(
            "INSERT INTO decisions (campaign_id, ai_recommendation, ai_confidence,"
            " ai_risk_score, human_decision, outcome, reviewer_note)"
            " VALUES (%s, %s, %s, %s, %s, %s, %s)"
            " RETURNING decided_at",
            (
                report.campaign_id,
                report.recommendation,
                report.confidence,
                report.risk_score,
                human_decision,
                outcome,
                reviewer_note,
            ),
        ).fetchone()

    return DecisionLogEntry(
        campaign_id=report.campaign_id,
        ai_recommendation=report.recommendation,
        ai_confidence=report.confidence,
        ai_risk_score=report.risk_score,
        human_decision=human_decision,
        outcome=outcome,
        reviewer_note=reviewer_note,
        # Taken from the database, not from the app clock, so the timestamp matches
        # what was actually stored.
        decided_at=_iso(row["decided_at"]),
    )


def decisions() -> list[DecisionLogEntry]:
    with connect() as conn:
        rows = conn.execute("SELECT * FROM decisions ORDER BY decided_at DESC, id DESC").fetchall()
    return [
        DecisionLogEntry(
            campaign_id=r["campaign_id"],
            ai_recommendation=r["ai_recommendation"],
            ai_confidence=r["ai_confidence"],
            ai_risk_score=r["ai_risk_score"],
            human_decision=r["human_decision"],
            outcome=r["outcome"],
            reviewer_note=r["reviewer_note"],
            decided_at=_iso(r["decided_at"]),
        )
        for r in rows
    ]


def decided_ids() -> set[str]:
    with connect() as conn:
        rows = conn.execute("SELECT DISTINCT campaign_id FROM decisions").fetchall()
    return {r["campaign_id"] for r in rows}


def outcome_counts() -> dict[str, int]:
    """Aggregated in SQL rather than in Python — this is the drift signal, and in
    production it is a rollup over far more rows than a process wants in memory."""
    with connect() as conn:
        rows = conn.execute(
            "SELECT outcome, COUNT(*) AS n FROM decisions GROUP BY outcome"
        ).fetchall()
    return {r["outcome"]: r["n"] for r in rows}


def _iso(value: datetime | str) -> str:
    if isinstance(value, str):
        return value
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat(timespec="seconds")

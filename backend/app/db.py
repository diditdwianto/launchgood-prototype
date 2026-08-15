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
        # Fixture assessments are a cache, rebuilt from the committed seed on every
        # boot. Assessments for SUBMITTED campaigns are not — there is no seed to
        # rebuild them from, so truncating the whole table meant every campaign a
        # reviewer submitted vanished from the queue on the next restart, while its
        # row sat orphaned in submitted_campaigns.
        #
        # Decisions are never dropped at all; persisting them is why this runs on
        # Postgres.
        with connect() as conn:
            conn.execute(
                "DELETE FROM assessments WHERE campaign_id NOT IN"
                " (SELECT campaign_id FROM submitted_campaigns)"
            )


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
    """Agreement is only meaningful when both sides actually committed.

    `manual_review` is the AI declining to predict; escalation is the human declining
    to decide. Neither is a judgment about the other, so neither belongs in the
    agreement rate.

    Escalation was previously scored as an override whenever the AI had said approve
    or reject, which quietly penalised the model for cases where the reviewer simply
    passed the campaign on. Counting deferrals as agreement would be worse still — a
    model could score perfectly by never committing — so they are excluded from the
    rate and tracked separately.
    """
    if human_decision == "escalate" or recommendation == "manual_review":
        return "deferred"
    return "agreed" if recommendation == human_decision else "overrode"


def record_decision(
    report: RiskReport,
    human_decision: Decision,
    reviewer_note: str = "",
    decided_by: str = "",
    recommendation_visible: bool = True,
) -> DecisionLogEntry:
    outcome = classify_outcome(report.recommendation, human_decision)

    with connect() as conn:
        row = conn.execute(
            "INSERT INTO decisions (campaign_id, ai_recommendation, ai_confidence,"
            " ai_risk_score, human_decision, outcome, reviewer_note, decided_by,"
            " recommendation_visible)"
            " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)"
            " RETURNING decided_at",
            (
                report.campaign_id,
                report.recommendation,
                report.confidence,
                report.risk_score,
                human_decision,
                outcome,
                reviewer_note,
                decided_by,
                recommendation_visible,
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
        decided_by=decided_by,
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
            decided_by=r.get("decided_by") or "",
            decided_at=_iso(r["decided_at"]),
        )
        for r in rows
    ]


def _latest_decisions() -> dict[str, str]:
    """Most recent human decision per campaign.

    Latest rather than any, because escalation is not the end of a campaign's life —
    a second reviewer decides afterwards, and that later row is the one that counts.
    """
    with connect() as conn:
        rows = conn.execute(
            "SELECT DISTINCT ON (campaign_id) campaign_id, human_decision"
            " FROM decisions ORDER BY campaign_id, decided_at DESC, id DESC"
        ).fetchall()
    return {r["campaign_id"]: r["human_decision"] for r in rows}


def resolved_ids() -> set[str]:
    """Campaigns that are finished. Escalated ones are not — they are waiting."""
    return {c for c, d in _latest_decisions().items() if d in ("approve", "reject")}


def escalated_ids() -> set[str]:
    """Campaigns a reviewer handed on, still awaiting a second opinion.

    These stay in the queue. Previously any decision row removed a campaign from it,
    so escalating made it disappear with nobody assigned — the reviewer believed they
    had handed it off and it had in fact been dropped.
    """
    return {c for c, d in _latest_decisions().items() if d == "escalate"}


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


# ----------------------------------------------------------- submitted campaigns


def save_campaign(campaign: dict, submitted_by: str) -> None:
    from psycopg.types.json import Jsonb as _Jsonb

    with connect() as conn:
        conn.execute(
            "INSERT INTO submitted_campaigns (campaign_id, payload, submitted_by)"
            " VALUES (%s, %s, %s)"
            " ON CONFLICT (campaign_id) DO UPDATE SET payload = EXCLUDED.payload",
            (campaign["campaign_id"], _Jsonb(campaign), submitted_by),
        )


def submitted_campaigns() -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT payload FROM submitted_campaigns ORDER BY submitted_at DESC"
        ).fetchall()
    return [r["payload"] for r in rows]


def next_campaign_id() -> str:
    """Continues the CMP-#### series past the fixtures so IDs never collide."""
    with connect() as conn:
        row = conn.execute(
            "SELECT MAX(CAST(SUBSTRING(campaign_id FROM 5) AS INTEGER)) AS n"
            " FROM submitted_campaigns WHERE campaign_id ~ '^CMP-[0-9]+$'"
        ).fetchone()
    return f"CMP-{max(row['n'] or 0, 4499) + 1}"


def training_readiness() -> dict:
    """How close the decision log is to being a usable training set.

    Counts the labels a model would actually learn from. Escalations are excluded:
    they record that a reviewer declined to decide, which is not a label for
    "approve or reject", so counting them would overstate readiness.
    """
    with connect() as conn:
        rows = conn.execute(
            "SELECT human_decision, COUNT(*) AS n FROM decisions GROUP BY human_decision"
        ).fetchall()
    counts = {r["human_decision"]: r["n"] for r in rows}
    approve = counts.get("approve", 0)
    reject = counts.get("reject", 0)
    return {
        "decisive_labels": approve + reject,
        "approve": approve,
        "reject": reject,
        "escalate": counts.get("escalate", 0),
        # Rules of thumb for tabular gradient boosting, not measurements from this
        # platform. Stated as targets so the gap is visible rather than implied.
        "target_labels": 2000,
        "target_minority": 200,
        **_assisted_split(),
    }


def _assisted_split() -> dict:
    """Decisive labels split by whether the reviewer saw the recommendation.

    The unassisted count is the one that matters: assisted decisions are partly a
    measurement of the model's own influence, so a training set made only of them
    cannot show whether the model is right, only whether it is self-consistent.
    """
    with connect() as conn:
        rows = conn.execute(
            "SELECT recommendation_visible AS seen, COUNT(*) AS n FROM decisions"
            " WHERE human_decision IN ('approve','reject')"
            " GROUP BY recommendation_visible"
        ).fetchall()
    by = {r["seen"]: r["n"] for r in rows}
    return {
        "assisted_labels": by.get(True, 0),
        "unassisted_labels": by.get(False, 0),
        "unknown_labels": by.get(None, 0),
    }

"""The one node where a model does the work a rules engine cannot."""

from __future__ import annotations

import logging
import os
import re
import threading
import time

from groq import Groq
from pydantic import ValidationError

from .prompts import SYNTHESIS_SYSTEM
from .schemas import Flag, SynthesisDraft

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "openai/gpt-oss-20b"

# Groq list pricing, USD per million tokens (input, output).
PRICING: dict[str, tuple[float, float]] = {
    "openai/gpt-oss-20b": (0.075, 0.30),
    "openai/gpt-oss-120b": (0.15, 0.60),
    "openai/gpt-oss-safeguard-20b": (0.075, 0.30),
    "qwen/qwen3.6-27b": (0.60, 3.00),
}

# Every entry verified by direct API call against the real evidence bundle on
# 2026-08-14, not from documentation. The whole pipeline depends on strict structured
# output, so a model that cannot produce it is not a fallback — it is an outage with
# extra steps. The chain is validated up front so a misconfiguration fails loudly at
# startup instead of silently at 3am.
#
# Confirmed NOT usable, each by direct test:
#   llama-3.3-70b-versatile, llama-3.1-8b-instant
#       reject `json_schema` outright.
#   groq/compound
#       rejects `json_schema`, and its 429 names `openai/gpt-oss-120b` as the model it
#       routes to — so it draws on that model's daily quota and cannot be a fallback
#       for the very model it depends on.
#   qwen/qwen3.6-27b
#       accepts the schema and succeeds on short prompts, but returns an empty
#       generation on the real system prompt plus bundle — it is a reasoning model and
#       spends its budget before emitting JSON. Allowed, but a poor last resort; it is
#       deliberately not in the default chain.
SCHEMA_CAPABLE_MODELS = {
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-safeguard-20b",
    "qwen/qwen3.6-27b",
}


# Daily token quotas are per-model, so a model that is exhausted is not a model that
# is slow — no amount of backoff recovers it. `groq_model` accepts a comma-separated
# chain; when one model's quota is gone the next one takes over mid-run rather than
# the whole batch failing. Order it cheapest-capable first.
def model_chain() -> list[str]:
    raw = os.environ.get("groq_model", DEFAULT_MODEL)
    chain = [m.strip() for m in raw.split(",") if m.strip()] or [DEFAULT_MODEL]

    unusable = [m for m in chain if m not in SCHEMA_CAPABLE_MODELS]
    if unusable:
        raise ValueError(
            f"groq_model contains models that cannot produce strict structured output: "
            f"{', '.join(unusable)}. The risk report contract depends on it, so these "
            f"would fail every call rather than act as a fallback. "
            f"Known-good: {', '.join(sorted(SCHEMA_CAPABLE_MODELS))}."
        )
    return chain


def model_name() -> str:
    """The model currently in use — the first in the chain that has not been exhausted."""
    chain = model_chain()
    return next((m for m in chain if m not in _exhausted), chain[-1])


# Models whose quota ran out this process. Not retried again; the chain moves on.
_exhausted: set[str] = set()

# Live rate-limit state per model, scraped from response headers.
#
# Groq exposes remaining per-MINUTE capacity on every response (x-ratelimit-*), but
# publishes no endpoint and no header for the per-DAY token quota — that number
# appears only inside the text of the 429 that announces you have hit it. So the
# minute window can be watched proactively, and the daily one can only be recorded
# after the fact. Both are captured here; neither is inferred.
_limits: dict[str, dict] = {}

_DAILY_QUOTA_RE = re.compile(
    r"on tokens per day \(TPD\): Limit (\d+), Used (\d+)", re.IGNORECASE
)


def _record_headers(model: str, headers) -> None:
    entry = _limits.setdefault(model, {})
    for key, field in (
        ("x-ratelimit-remaining-tokens", "tokens_remaining_this_minute"),
        ("x-ratelimit-limit-tokens", "tokens_per_minute"),
        ("x-ratelimit-remaining-requests", "requests_remaining"),
        ("x-ratelimit-reset-tokens", "tokens_reset_in"),
    ):
        value = headers.get(key)
        if value is not None:
            entry[field] = value


def _record_daily_quota(model: str, exc: Exception) -> None:
    match = _DAILY_QUOTA_RE.search(str(exc))
    if match:
        limit, used = int(match.group(1)), int(match.group(2))
        _limits.setdefault(model, {}).update(
            {"tokens_per_day": limit, "tokens_used_today": used}
        )


def rate_limits() -> dict[str, dict]:
    return {m: dict(v) for m, v in _limits.items()}


MAX_TRANSIENT_RETRIES = 4
SCHEMA_REPAIR_ATTEMPTS = 1  # Capped deliberately. An unbounded repair loop against a
# confidently-wrong model burns cost while hiding the prompt bug you need to see.


class Usage:
    """Token accounting, tracked per model.

    Per-model rather than aggregate because the chain can shift mid-run: pricing
    differs by an order of magnitude across it, so one blended figure would be wrong
    for every model in it.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.calls = 0
        self.seconds = 0.0
        self.by_model: dict[str, dict[str, int]] = {}

    def add(self, model: str, prompt: int, completion: int, seconds: float) -> None:
        with self._lock:
            self.calls += 1
            self.seconds += seconds
            entry = self.by_model.setdefault(model, {"calls": 0, "prompt": 0, "completion": 0})
            entry["calls"] += 1
            entry["prompt"] += prompt
            entry["completion"] += completion

    @property
    def usd(self) -> float:
        total = 0.0
        for model, e in self.by_model.items():
            # Unknown model: contribute 0 rather than inventing a rate. A cost figure
            # you cannot source is worse than no cost figure.
            price_in, price_out = PRICING.get(model, (0.0, 0.0))
            total += (e["prompt"] * price_in + e["completion"] * price_out) / 1_000_000
        return total

    def summary(self) -> dict:
        return {
            "models_used": {m: e["calls"] for m, e in self.by_model.items()},
            "calls": self.calls,
            "prompt_tokens": sum(e["prompt"] for e in self.by_model.values()),
            "completion_tokens": sum(e["completion"] for e in self.by_model.values()),
            "total_usd": round(self.usd, 5),
            "usd_per_call": round(self.usd / self.calls, 5) if self.calls else 0.0,
            "avg_seconds": round(self.seconds / self.calls, 2) if self.calls else 0.0,
        }


usage = Usage()

_client: Groq | None = None


def _get_client() -> Groq:
    global _client
    if _client is None:
        _client = Groq(api_key=os.environ["groq_api_key"])
    return _client


# Groq's own error codes for "the model failed to satisfy the strict schema on this
# sample". Matched on code rather than on the human-readable message, which is not
# stable: gpt-oss-120b says "Generated JSON does not match the expected schema" and
# gpt-oss-20b says "Failed to validate JSON", so a prose match silently stopped
# retrying the moment the model was swapped.
SCHEMA_FAILURE_CODES = {"json_validate_failed", "json_schema_validation_failed"}


def _error_code(exc: Exception) -> str | None:
    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        error = body.get("error")
        if isinstance(error, dict):
            return error.get("code")
    return None


def _is_quota_exhausted(exc: Exception) -> bool:
    """A daily quota is not a pacing problem.

    Groq returns 429 for both "you are going too fast" and "you are out of tokens for
    today", and only the message separates them. Backing off on the second wastes the
    whole retry budget on a call that cannot succeed until tomorrow, which is exactly
    what makes it worth falling back to another model instead.
    """
    if getattr(exc, "status_code", None) != 429:
        return False

    message = str(exc).lower()
    if "per day" in message or "tpd" in message or "rpd" in message:
        return True

    # A retry-after measured in minutes is a quota in all but name.
    response = getattr(exc, "response", None)
    header = response.headers.get("retry-after") if response is not None else None
    try:
        return float(header) > 120 if header else False
    except (TypeError, ValueError):
        return False


def _retry_delay(exc: Exception, attempt: int) -> float | None:
    """None means do not retry.

    Three upstream failures are worth distinguishing. A 429 is a pacing problem and
    the server tells us how long to wait. A 400 whose code says the model could not
    satisfy strict mode is sample-dependent — a fresh sample usually succeeds — so it
    is retryable. Any other 400 is a bug in our request, and retrying it just burns
    quota against a call that will never succeed.
    """
    status = getattr(exc, "status_code", None)

    if status == 429:
        wait = getattr(exc, "response", None)
        header = wait.headers.get("retry-after") if wait is not None else None
        try:
            return min(float(header), 30.0) if header else 2.0 * 2**attempt
        except (TypeError, ValueError):
            return 2.0 * 2**attempt

    if status == 400:
        code = _error_code(exc)
        if code in SCHEMA_FAILURE_CODES or "validate json" in str(exc).lower():
            return 0.5 * 2**attempt
        return None

    if status is None or status >= 500:
        return 0.5 * 2**attempt

    return None


def _call_one(model: str, messages: list[dict]) -> str:
    """Try a single model, with retries for genuinely transient failures.

    Raises on quota exhaustion immediately rather than burning the retry budget.
    """
    schema = SynthesisDraft.model_json_schema()

    for attempt in range(MAX_TRANSIENT_RETRIES + 1):
        started = time.perf_counter()
        try:
            raw = _get_client().chat.completions.with_raw_response.create(
                model=model,
                messages=messages,
                response_format={
                    "type": "json_schema",
                    "json_schema": {"name": "risk_synthesis", "strict": True, "schema": schema},
                },
                temperature=0.2,
            )
            _record_headers(model, raw.headers)
            resp = raw.parse()
        except Exception as exc:  # noqa: BLE001 - classified below
            response = getattr(exc, "response", None)
            if response is not None:
                _record_headers(model, response.headers)
            if _is_quota_exhausted(exc):
                _record_daily_quota(model, exc)
                raise
            delay = _retry_delay(exc, attempt)
            if delay is None or attempt == MAX_TRANSIENT_RETRIES:
                raise
            time.sleep(delay)
            continue

        usage.add(
            model,
            resp.usage.prompt_tokens,
            resp.usage.completion_tokens,
            time.perf_counter() - started,
        )
        return resp.choices[0].message.content

    raise RuntimeError("unreachable")


def _call(messages: list[dict]) -> str:
    """Walk the model chain, moving on when a model's quota is gone.

    Falling back is a real change in behaviour, not a transparent retry: a smaller
    model produces different flags. It is logged and surfaced in /api/health so a
    reviewer is never quietly reading output from a model they did not choose.
    """
    chain = model_chain()
    last: Exception | None = None

    for model in chain:
        if model in _exhausted:
            continue
        try:
            return _call_one(model, messages)
        except Exception as exc:  # noqa: BLE001
            last = exc
            if _is_quota_exhausted(exc) and model != chain[-1]:
                _exhausted.add(model)
                logger.warning(
                    "quota exhausted for %s, falling back to next model in chain", model
                )
                continue
            raise

    raise last if last else RuntimeError("no models available in chain")


def llm_synthesize(bundle: str, preexisting: str, pre_flags: list[Flag]) -> SynthesisDraft:
    user = (
        f"{preexisting}\n\n"
        "=== EVIDENCE BUNDLE ===\n"
        f"{bundle}\n"
        "=== END EVIDENCE BUNDLE ===\n\n"
        "Add only flags the automated checks could not determine, grounded in the bundle "
        "above. Then give your recommendation, your confidence, and a summary for the "
        "human reviewer."
    )
    messages = [
        {"role": "system", "content": SYNTHESIS_SYSTEM},
        {"role": "user", "content": user},
    ]

    raw = _call(messages)
    try:
        return SynthesisDraft.model_validate_json(raw)
    except ValidationError as exc:
        if SCHEMA_REPAIR_ATTEMPTS < 1:
            raise
        messages += [
            {"role": "assistant", "content": raw},
            {
                "role": "user",
                "content": (
                    f"That response failed validation:\n{exc}\n\n"
                    "Return corrected JSON matching the schema exactly. Do not add new "
                    "flags or change your findings; fix only the structure."
                ),
            },
        ]
        return SynthesisDraft.model_validate_json(_call(messages))

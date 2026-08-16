"""The one node where a model does the work a rules engine cannot.

Two providers, one client. Groq and NVIDIA both expose OpenAI-compatible endpoints,
so this uses the `openai` SDK against two base URLs rather than carrying two vendor
SDKs with two exception hierarchies.

The chain is ordered fast-first, durable-last:

    gpt-oss-20b → gpt-oss-120b → gpt-oss-safeguard-20b → nemotron-3-super-120b

The first three are Groq: ~1.5-3s, but capped at 200k tokens per model per DAY, and
once that is gone it is gone until tomorrow. The last is NVIDIA: measured at 19-33s
warm, but limited per MINUTE rather than per day. So the system degrades to slow
rather than to broken, which is the right direction for a reviewer-facing tool.
"""

from __future__ import annotations

import logging
import os
import re
import threading
import time
from dataclasses import dataclass

from openai import OpenAI
from pydantic import BaseModel, ValidationError

from .prompts import CLARIFICATION_SYSTEM, SYNTHESIS_SYSTEM
from .schemas import ClarificationDraft, Flag, SynthesisDraft

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Provider:
    name: str
    base_url: str
    key_env: str


PROVIDERS = {
    "groq": Provider("groq", "https://api.groq.com/openai/v1", "groq_api_key"),
    "nvidia": Provider(
        "nvidia", "https://integrate.api.nvidia.com/v1", "nvidia_build_api_key"
    ),
}


@dataclass(frozen=True)
class ModelSpec:
    provider: str
    # USD per million tokens (input, output). None where the tier is free credits
    # rather than metered — reporting $0.00000 would imply a measured cost.
    price: tuple[float, float] | None
    timeout: float
    note: str = ""


# Every entry verified by direct API call against the real evidence bundle and the
# real SynthesisDraft schema. The pipeline depends on strict structured output, so a
# model that cannot produce it is not a fallback — it is an outage with extra steps.
#
# Confirmed NOT usable, each by direct test:
#   Groq    llama-3.3-70b-versatile, llama-3.1-8b-instant — reject json_schema.
#   Groq    groq/compound — rejects json_schema, and its 429 names gpt-oss-120b as
#           what it routes to, so it shares the quota it would be backing up.
#   Groq    qwen/qwen3.6-27b — accepts the schema, returns an empty generation on the
#           real bundle. Reasoning model, spends its budget before emitting JSON.
#   NVIDIA  mistral-large-2-instruct, kimi-k2.6 — 404 on this tier.
#   NVIDIA  llama-3.3-70b-instruct — exceeded 90s on every attempt.
MODELS: dict[str, ModelSpec] = {
    "openai/gpt-oss-20b": ModelSpec("groq", (0.075, 0.30), 60.0),
    "openai/gpt-oss-120b": ModelSpec("groq", (0.15, 0.60), 60.0),
    "openai/gpt-oss-safeguard-20b": ModelSpec("groq", (0.075, 0.30), 60.0),
    "qwen/qwen3.6-27b": ModelSpec(
        "groq", (0.60, 3.00), 60.0, "unreliable on long prompts; not in the default chain"
    ),
    "nvidia/nemotron-3-super-120b-a12b": ModelSpec(
        "nvidia", None, 150.0, "19-33s warm; per-minute limit, no daily token cap"
    ),
    "nvidia/nemotron-3.5-lightning-30b-a3b": ModelSpec("nvidia", None, 120.0, "~16s warm"),
    "nvidia/nemotron-3-nano-30b-a3b": ModelSpec("nvidia", None, 120.0, "~15s warm"),
    "meta/llama-3.1-8b-instruct": ModelSpec(
        "nvidia", None, 60.0, "2s but 8B; weaker prompt adherence in testing"
    ),
}

DEFAULT_CHAIN = [
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-safeguard-20b",
    "nvidia/nemotron-3-super-120b-a12b",
]

MAX_TRANSIENT_RETRIES = 4
SCHEMA_REPAIR_ATTEMPTS = 1  # Capped deliberately. An unbounded repair loop against a
# confidently-wrong model burns cost while hiding the prompt bug you need to see.


def model_chain() -> list[str]:
    """Ordered list of models to try. `model_chain` env var overrides the default."""
    raw = os.environ.get("model_chain") or os.environ.get("groq_model") or ""
    chain = [m.strip() for m in raw.split(",") if m.strip()] or list(DEFAULT_CHAIN)

    unknown = [m for m in chain if m not in MODELS]
    if unknown:
        raise ValueError(
            f"model_chain contains models not verified for strict structured output: "
            f"{', '.join(unknown)}. The risk report contract depends on it, so these "
            f"would fail every call rather than act as a fallback. "
            f"Known-good: {', '.join(sorted(MODELS))}."
        )

    missing_key = [m for m in chain if not os.environ.get(PROVIDERS[MODELS[m].provider].key_env)]
    if missing_key:
        logger.warning(
            "no API key for %s; these will be skipped", ", ".join(missing_key)
        )
    return chain


def usable_chain() -> list[str]:
    """Chain minus models with no key configured and models already exhausted."""
    return [
        m
        for m in model_chain()
        if os.environ.get(PROVIDERS[MODELS[m].provider].key_env) and m not in _exhausted
    ]


def model_name() -> str:
    """The model currently in use — first in the chain still available."""
    usable = usable_chain()
    return usable[0] if usable else model_chain()[-1]


def provider_of(model: str) -> str:
    return MODELS[model].provider if model in MODELS else "unknown"


# Models whose quota ran out this process. Not retried again; the chain moves on.
_exhausted: set[str] = set()

# Live rate-limit state per model, scraped from response headers.
#
# Groq exposes remaining per-MINUTE capacity on every response (x-ratelimit-*), but
# publishes no endpoint and no header for the per-DAY token quota — that number
# appears only inside the text of the 429 that announces you have hit it. NVIDIA
# returns no rate-limit headers at all, so its row stays empty by design.
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


class Usage:
    """Token accounting, tracked per model.

    Per-model rather than aggregate because the chain spans two providers and an
    order of magnitude in price; one blended figure would be wrong for every model.
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
        """Metered spend only. Free-tier models contribute nothing, which is why the
        figure is reported alongside a per-model breakdown rather than on its own."""
        total = 0.0
        for model, e in self.by_model.items():
            spec = MODELS.get(model)
            if spec is None or spec.price is None:
                continue
            price_in, price_out = spec.price
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

_clients: dict[str, OpenAI] = {}


def _client_for(model: str) -> OpenAI:
    spec = MODELS[model]
    provider = PROVIDERS[spec.provider]
    if provider.name not in _clients:
        _clients[provider.name] = OpenAI(
            base_url=provider.base_url,
            api_key=os.environ[provider.key_env],
            max_retries=0,  # retries are handled here, with classification
        )
    return _clients[provider.name]


# Error codes meaning "the model failed to satisfy the strict schema on this sample".
# Matched on code rather than message: gpt-oss-120b says "Generated JSON does not
# match the expected schema" while gpt-oss-20b says "Failed to validate JSON", so a
# prose match silently stopped retrying the moment the model was swapped.
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

    Groq returns 429 both for "you are going too fast" and "you are out of tokens for
    today", and only the message separates them. NVIDIA's limit is per-minute, so its
    429s are always transient and never land here — which is the whole reason it sits
    last in the chain.
    """
    if getattr(exc, "status_code", None) != 429:
        return False

    message = str(exc).lower()
    if "per day" in message or "tpd" in message or "rpd" in message:
        return True

    response = getattr(exc, "response", None)
    header = response.headers.get("retry-after") if response is not None else None
    try:
        return float(header) > 120 if header else False
    except (TypeError, ValueError):
        return False


_DURATION_RE = re.compile(r"(?:(\d+)m)?(\d+(?:\.\d+)?)s|(\d+)ms")


def _parse_groq_duration(text: str) -> float | None:
    """Parse Groq's `Xm Ys` / `Ys` / `Xms` reset-time format into seconds.

    Discovered this was needed the hard way: Groq does not send a `Retry-After`
    header on 429s at all — the real wait time is only in `x-ratelimit-reset-tokens`,
    in this format. Every 429 retry before this fix was guessing with blind
    exponential backoff instead of reading the number the server actually sent.
    """
    match = _DURATION_RE.fullmatch(text.strip())
    if not match:
        return None
    minutes, seconds, millis = match.groups()
    if millis is not None:
        return int(millis) / 1000
    return (int(minutes) * 60 if minutes else 0) + float(seconds)


def _retry_delay(exc: Exception, attempt: int) -> float | None:
    """None means do not retry."""
    status = getattr(exc, "status_code", None)

    if status == 429:
        response = getattr(exc, "response", None)
        headers = response.headers if response is not None else {}
        # `retry-after` is the HTTP-standard header; Groq does not send it in
        # practice, but checking first costs nothing and covers any provider that
        # does. `x-ratelimit-reset-tokens` is what Groq actually sends.
        header = headers.get("retry-after")
        if header:
            try:
                return min(float(header), 30.0)
            except (TypeError, ValueError):
                pass
        reset = headers.get("x-ratelimit-reset-tokens")
        if reset:
            parsed = _parse_groq_duration(reset)
            if parsed is not None:
                return min(parsed + 0.5, 30.0)  # +0.5s: land just after the window opens
        return 2.0 * 2**attempt

    if status == 400:
        code = _error_code(exc)
        if code in SCHEMA_FAILURE_CODES or "validate json" in str(exc).lower():
            return 0.5 * 2**attempt
        return None

    if status is None or status >= 500:
        return 0.5 * 2**attempt

    return None


def _call_one(
    model: str, messages: list[dict], response_model: type[BaseModel], schema_name: str
) -> str:
    """Try a single model, retrying only genuinely transient failures.

    Generic over the response schema — this is the shared machinery behind both
    `llm_synthesize` (SynthesisDraft) and `draft_clarification` (ClarificationDraft).
    A second structured-output task should not mean a second retry/fallback/quota
    implementation to keep correct.
    """
    schema = response_model.model_json_schema()
    spec = MODELS[model]

    for attempt in range(MAX_TRANSIENT_RETRIES + 1):
        started = time.perf_counter()
        try:
            raw = _client_for(model).chat.completions.with_raw_response.create(
                model=model,
                messages=messages,
                response_format={
                    "type": "json_schema",
                    "json_schema": {"name": schema_name, "strict": True, "schema": schema},
                },
                temperature=0.2,
                timeout=spec.timeout,
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

            # Feed a schema rejection back rather than resending an identical prompt.
            # A blind retry only helps when the failure is a bad sample; when the
            # prompt asks for something the schema cannot express it fails the same
            # way every time.
            #
            # Two different failures land here and need different words. CMP-4480
            # used a source value the schema did not contain — a wrong-value error,
            # "missing properties: 'recommendation', 'confidence', ...". CMP-4503 used
            # only valid values but the model stopped generating right after the flags
            # array, on an evidence-dense bundle about a real banned organization —
            # not a refusal (finish_reason was "stop" and the flag it did write was
            # substantive and well grounded), just an incomplete object. The original
            # instruction ("use exactly the enum values the schema permits") did not
            # address that case, so both are named explicitly here.
            #
            # Appended once, on the first such failure: `messages` is the list every
            # subsequent attempt is called with, so the instruction is not lost after
            # attempt 0 — it stays in the conversation for the rest of the retries.
            # Re-appending it on every attempt would just stack up identical messages.
            if _error_code(exc) in SCHEMA_FAILURE_CODES and attempt == 0:
                required = ", ".join(schema.get("required", []))
                messages = messages + [
                    {
                        "role": "user",
                        "content": (
                            "Your previous response was rejected by schema validation:\n"
                            f"{str(exc)[:600]}\n\n"
                            "Either a field used a value the schema does not permit, or "
                            "the response stopped before the object was complete. Return "
                            f"the full JSON object with every required field present — "
                            f"{required} — using only the enum values the schema allows. "
                            "If any text field was very long, shorten it; do not let it "
                            "crowd out the fields after it. Do not change your findings."
                        ),
                    }
                ]

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


def _call(messages: list[dict], response_model: type[BaseModel], schema_name: str) -> str:
    """Walk the chain, moving on when a model isn't working right now.

    Falling back is a real change in behaviour, not a transparent retry: a different
    model produces different flags, and the NVIDIA tail is an order of magnitude
    slower. It is logged and surfaced in /api/health so nobody is quietly reading
    output from a model they did not choose.

    Two different reasons a model can fail here, handled differently. A daily quota
    is exhausted for the rest of the day — `_exhausted` remembers that, so this
    process stops trying it. A per-minute rate limit is not: `_call_one` already
    retried it within its own budget and gave up, but the model will very likely
    work again on the next campaign a few seconds later, so it is not marked
    exhausted — only skipped for this one call. Before this distinction existed, a
    per-minute 429 on the first model in the chain failed the whole assessment
    rather than falling through to a second model that almost certainly had headroom
    of its own — observed directly on CMP-4476, where gpt-oss-20b hit its per-minute
    cap and the assessment failed outright instead of trying gpt-oss-120b.
    """
    chain = usable_chain() or model_chain()[-1:]
    last: Exception | None = None

    for model in chain:
        try:
            return _call_one(model, messages, response_model, schema_name)
        except Exception as exc:  # noqa: BLE001
            last = exc
            if _is_quota_exhausted(exc):
                _exhausted.add(model)
                logger.warning(
                    "daily quota exhausted for %s, falling back to next model in chain", model
                )
            else:
                logger.warning(
                    "%s did not succeed within its own retry budget (%s), "
                    "falling back to next model in chain",
                    model,
                    type(exc).__name__,
                )
            if model != chain[-1]:
                continue
            raise

    raise last if last else RuntimeError("no models available in chain")


def _call_structured(
    messages: list[dict], response_model: type[BaseModel], schema_name: str, repair_hint: str
):
    """`_call` plus one extra repair round if Groq's own strict-mode check passed but
    our own (stricter, e.g. numeric range) validation still rejects the result."""
    raw = _call(messages, response_model, schema_name)
    try:
        return response_model.model_validate_json(raw)
    except ValidationError as exc:
        if SCHEMA_REPAIR_ATTEMPTS < 1:
            raise
        messages = messages + [
            {"role": "assistant", "content": raw},
            {
                "role": "user",
                "content": (
                    f"That response failed validation:\n{exc}\n\n"
                    f"Return corrected JSON matching the schema exactly. {repair_hint}"
                ),
            },
        ]
        return response_model.model_validate_json(_call(messages, response_model, schema_name))


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
    return _call_structured(
        messages,
        SynthesisDraft,
        "risk_synthesis",
        "Do not add new flags or change your findings; fix only the structure.",
    )


def draft_clarification(campaign: dict, claim: str, evidence_summary: str) -> ClarificationDraft:
    """Draft a request-for-more-information message about one specific finding.

    Deliberately narrow: one claim per call. A reviewer choosing which finding to
    follow up on is the human-in-the-loop moment; batching several claims into one
    message would blur exactly the specificity the finding's `claim` field exists to
    provide.
    """
    user = (
        f"Campaign: {campaign['title']}\n"
        f"Organizer: {campaign['organizer_name']}\n\n"
        f"Campaign text (match this language in your draft):\n{campaign['body']}\n\n"
        f"Claim to ask about: {claim}\n"
        f"What the evidence showed: {evidence_summary}\n\n"
        "Draft the message."
    )
    messages = [
        {"role": "system", "content": CLARIFICATION_SYSTEM},
        {"role": "user", "content": user},
    ]
    return _call_structured(
        messages,
        ClarificationDraft,
        "clarification_draft",
        "Do not change what you are asking about; fix only the structure.",
    )


def probe_limits() -> None:
    """Refresh rate-limit headers for every model in the chain.

    Groq only reveals limits on a response, so knowing where a model stands costs a
    request. This sends the smallest one possible. Probing an exhausted model is worth
    doing rather than skipping: the 429 is the only place the per-day quota is ever
    stated, so a model that has run out is the one that will tell you its ceiling.

    NVIDIA is skipped — it returns no rate-limit headers, so a probe would spend a
    request and learn nothing.
    """
    for model in model_chain():
        spec = MODELS[model]
        if spec.provider != "groq":
            continue
        if not os.environ.get(PROVIDERS[spec.provider].key_env):
            continue
        try:
            raw = _client_for(model).chat.completions.with_raw_response.create(
                model=model,
                messages=[{"role": "user", "content": "ping"}],
                max_completion_tokens=1,
                timeout=20.0,
            )
            _record_headers(model, raw.headers)
        except Exception as exc:  # noqa: BLE001
            response = getattr(exc, "response", None)
            if response is not None:
                _record_headers(model, response.headers)
            if _is_quota_exhausted(exc):
                _record_daily_quota(model, exc)
                _exhausted.add(model)


def telemetry() -> dict:
    """Everything the console knows about its own model layer."""
    chain = model_chain()
    active = model_name()
    per_model = usage.by_model

    models = []
    for position, model in enumerate(chain, start=1):
        spec = MODELS[model]
        spent = per_model.get(model, {"calls": 0, "prompt": 0, "completion": 0})
        price = spec.price
        cost = (
            round(
                (spent["prompt"] * price[0] + spent["completion"] * price[1]) / 1_000_000,
                5,
            )
            if price
            else 0.0
        )
        models.append(
            {
                "model": model,
                "provider": spec.provider,
                "position": position,
                "active": model == active,
                "exhausted": model in _exhausted,
                "configured": bool(os.environ.get(PROVIDERS[spec.provider].key_env)),
                "metered": price is not None,
                "note": spec.note,
                "pricing": (
                    {"input_per_mtok": price[0], "output_per_mtok": price[1]}
                    if price
                    else None
                ),
                "limits": _limits.get(model, {}),
                "usage": {**spent, "usd": cost},
            }
        )

    return {
        "providers": sorted({MODELS[m].provider for m in chain}),
        "chain": models,
        "schema_capable_models": sorted(MODELS),
        "totals": usage.summary(),
    }

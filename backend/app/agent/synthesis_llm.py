"""The one node where a model does the work a rules engine cannot."""

from __future__ import annotations

import os
import threading
import time

from groq import Groq
from pydantic import ValidationError

from .prompts import SYNTHESIS_SYSTEM
from .schemas import Flag, SynthesisDraft

# Groq list pricing for openai/gpt-oss-120b, USD per million tokens.
PRICE_IN = 0.15
PRICE_OUT = 0.75

MAX_TRANSIENT_RETRIES = 4
SCHEMA_REPAIR_ATTEMPTS = 1  # Capped deliberately. An unbounded repair loop against a
# confidently-wrong model burns cost while hiding the prompt bug you need to see.


class Usage:
    """Process-wide token accounting. Cost is named in the role's grading criteria."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.calls = 0
        self.prompt_tokens = 0
        self.completion_tokens = 0
        self.seconds = 0.0

    def add(self, prompt: int, completion: int, seconds: float) -> None:
        with self._lock:
            self.calls += 1
            self.prompt_tokens += prompt
            self.completion_tokens += completion
            self.seconds += seconds

    @property
    def usd(self) -> float:
        return (self.prompt_tokens * PRICE_IN + self.completion_tokens * PRICE_OUT) / 1_000_000

    def summary(self) -> dict:
        return {
            "calls": self.calls,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
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


def _model() -> str:
    return os.environ.get("groq_model", "openai/gpt-oss-120b")


def _retry_delay(exc: Exception, attempt: int) -> float | None:
    """None means do not retry.

    Two upstream failures are worth distinguishing. A 429 is a pacing problem and
    the server tells us how long to wait. A 400 saying the generated JSON did not
    match the schema is the model failing to satisfy strict mode on this sample —
    a fresh sample usually succeeds, so it is retryable, while any other 400 is a
    bug in our request and retrying it just burns quota.
    """
    status = getattr(exc, "status_code", None)

    if status == 429:
        wait = getattr(exc, "response", None)
        header = wait.headers.get("retry-after") if wait is not None else None
        try:
            return min(float(header), 30.0) if header else 2.0 * 2**attempt
        except (TypeError, ValueError):
            return 2.0 * 2**attempt

    if status == 400 and "does not match the expected schema" in str(exc):
        return 0.5 * 2**attempt

    if status is None or status >= 500:
        return 0.5 * 2**attempt

    return None


def _call(messages: list[dict]) -> str:
    schema = SynthesisDraft.model_json_schema()

    for attempt in range(MAX_TRANSIENT_RETRIES + 1):
        started = time.perf_counter()
        try:
            resp = _get_client().chat.completions.create(
                model=_model(),
                messages=messages,
                response_format={
                    "type": "json_schema",
                    "json_schema": {"name": "risk_synthesis", "strict": True, "schema": schema},
                },
                temperature=0.2,
            )
        except Exception as exc:  # noqa: BLE001 - classified by _retry_delay
            delay = _retry_delay(exc, attempt)
            if delay is None or attempt == MAX_TRANSIENT_RETRIES:
                raise
            time.sleep(delay)
            continue

        usage.add(
            resp.usage.prompt_tokens,
            resp.usage.completion_tokens,
            time.perf_counter() - started,
        )
        return resp.choices[0].message.content

    raise RuntimeError("unreachable")


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

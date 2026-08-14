"""Evidence gathering. These tools compute facts; the LLM judges them.

Anything derivable by lookup or arithmetic is settled here rather than left to the
model to notice. The Phase 0 spike confirmed why: given a 6x-median ask stated
plainly in the bundle, the model did not raise it.
"""

from __future__ import annotations

import difflib
import json
import os
import re
import statistics
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal, Protocol

DATA = Path(__file__).resolve().parent.parent / "data"

# An ask is only remarkable relative to what first-time organizers normally raise.
HIGH_ASK_MEDIUM_MULTIPLE = 2.5
HIGH_ASK_HIGH_MULTIPLE = 5.0

TEXT_DUPLICATE_THRESHOLD = 0.85
FINGERPRINT_DUPLICATE_MIN = 2


@lru_cache(maxsize=1)
def _load(name: str) -> Any:
    return json.loads((DATA / name).read_text())


def load_campaigns() -> list[dict]:
    return _load("mock_campaigns.json")


def get_campaign(campaign_id: str) -> dict | None:
    return next((c for c in load_campaigns() if c["campaign_id"] == campaign_id), None)


# --------------------------------------------------------------------------- org

OrgStatus = Literal["verified", "lapsed", "revoked", "absent", "not_applicable"]


@dataclass
class OrgLookup:
    status: OrgStatus
    detail: str
    record: dict | None = None


def org_registry_lookup(campaign: dict) -> OrgLookup:
    """Four registry states, not two.

    Collapsing these to verified/unverified is the single most common way a tool
    like this becomes useless: it flags every individual and every small
    unincorporated group identically to a charity whose registration was revoked.
    """
    name = campaign["organizer_name"]

    if campaign["organizer_type"] == "individual":
        return OrgLookup(
            "not_applicable",
            f"{name} is an individual organizer. Organization registries do not list "
            "private individuals, so a non-match here carries no information either way.",
        )

    record = next((o for o in _load("mock_org_registry.json") if o["name"] == name), None)

    if record is None:
        return OrgLookup(
            "absent",
            f'"{name}" does not appear in any of the mock national registries checked. '
            "Many small and unincorporated community groups are legitimately unregistered, "
            "so this is a reason to verify, not a finding of wrongdoing.",
        )

    reg = f'{record["registry"]} ({record["registration_id"]})'
    if record["status"] == "verified":
        return OrgLookup(
            "verified",
            f'"{name}" is registered with {reg}, active since {record["registered_since"]}.',
            record,
        )
    if record["status"] == "lapsed":
        return OrgLookup(
            "lapsed",
            f'"{name}" is on record with {reg} but its registration has lapsed. '
            f'{record.get("note", "")}'.strip(),
            record,
        )
    return OrgLookup(
        "revoked",
        f'"{name}" had its registration with {reg} REVOKED. {record.get("note", "")}'.strip(),
        record,
    )


# --------------------------------------------------------------- duplicate check


@dataclass
class DuplicateMatch:
    campaign_id: str
    title: str
    organizer_name: str
    status: str
    same_organizer: bool
    shared_fingerprints: list[str]
    text_similarity: float
    rejection_reason: str | None = None


@dataclass
class DuplicateResult:
    matches: list[DuplicateMatch] = field(default_factory=list)

    @property
    def worst(self) -> DuplicateMatch | None:
        if not self.matches:
            return None
        # A match against a rejected campaign outranks everything else.
        return sorted(
            self.matches,
            key=lambda m: (m.status == "rejected", not m.same_organizer, m.text_similarity),
            reverse=True,
        )[0]


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower().strip())


def duplicate_check(campaign: dict) -> DuplicateResult:
    """Text similarity is really computed; image matching is mocked via fingerprints.

    There is no vision model in this pipeline. `fingerprint` stands in for a
    perceptual hash and is pre-seeded in the mock data — stated as a limitation
    rather than implied to be real image forensics.
    """
    body = _normalize(campaign["body"])
    mine = {i["fingerprint"] for i in campaign["images"]}
    result = DuplicateResult()

    for past in _load("mock_past_campaigns.json"):
        shared = sorted(mine & set(past["image_fingerprints"]))
        similarity = difflib.SequenceMatcher(None, body, _normalize(past["body"])).ratio()

        if len(shared) >= FINGERPRINT_DUPLICATE_MIN or similarity >= TEXT_DUPLICATE_THRESHOLD:
            result.matches.append(
                DuplicateMatch(
                    campaign_id=past["campaign_id"],
                    title=past["title"],
                    organizer_name=past["organizer_name"],
                    status=past["status"],
                    same_organizer=past["organizer_name"] == campaign["organizer_name"],
                    shared_fingerprints=shared,
                    text_similarity=round(similarity, 3),
                    rejection_reason=past.get("rejection_reason"),
                )
            )
    return result


# ------------------------------------------------------------------ platform ask


@dataclass
class AskComparison:
    goal_usd: int
    median_first_time_ask: float
    multiple: float
    first_time_organizer: bool


def compare_ask(campaign: dict) -> AskComparison:
    asks = [p["goal_usd"] for p in _load("mock_past_campaigns.json") if p.get("first_time_organizer")]
    median = statistics.median(asks)
    return AskComparison(
        goal_usd=campaign["goal_usd"],
        median_first_time_ask=median,
        multiple=round(campaign["goal_usd"] / median, 2),
        first_time_organizer=campaign["prior_campaigns_on_platform"] == 0,
    )


# ------------------------------------------------------------------ media checks


@dataclass
class MediaCheck:
    claimed_location: str
    geo_tags: list[str]
    location_overlap: bool
    oldest_capture: str | None
    newest_capture: str | None
    stale_media: bool


def _tokens(location: str) -> set[str]:
    # Token equality, never substring: "Gaza" is a substring of "Gaziantep", so a
    # substring test would silently accept photos taken 1,600km from the claim.
    return {t for t in re.split(r"[,\s]+", location.lower()) if len(t) > 2}


def media_check(campaign: dict, submitted_year: int) -> MediaCheck:
    images = campaign["images"]
    geo_tags = sorted({i["geo_tag"] for i in images})
    claimed = _tokens(campaign["claimed_location"])
    overlap = any(claimed & _tokens(g) for g in geo_tags) if geo_tags else True

    captures = sorted(i["captured_at"] for i in images)
    stale = bool(captures) and int(captures[0][:4]) < submitted_year - 1

    return MediaCheck(
        claimed_location=campaign["claimed_location"],
        geo_tags=geo_tags,
        location_overlap=overlap,
        oldest_capture=captures[0] if captures else None,
        newest_capture=captures[-1] if captures else None,
        stale_media=stale,
    )


# ------------------------------------------------------------------- web search


class SearchProvider(Protocol):
    def search(self, query: str) -> list[dict]: ...


class MockSearchProvider:
    """Canned results keyed by organizer name. Deterministic by design."""

    name = "mock"

    def search(self, query: str) -> list[dict]:
        results = _load("mock_web_search.json")
        return results.get(query, [])


class TavilySearchProvider:
    """Real implementation against the same interface. Written, not wired in.

    Swapping providers is a one-line change in graph.py. Kept unused so the demo
    stays deterministic and cannot fail live on a network call.
    """

    name = "tavily"

    def __init__(self, api_key: str) -> None:
        self.api_key = api_key

    def search(self, query: str) -> list[dict]:
        import httpx

        resp = httpx.post(
            "https://api.tavily.com/search",
            json={
                "api_key": self.api_key,
                "query": f"{query} charity registration legitimacy",
                "max_results": 5,
            },
            timeout=10.0,
        )
        resp.raise_for_status()
        return [
            {"title": r["title"], "url": r["url"], "snippet": r["content"]}
            for r in resp.json().get("results", [])
        ]


def get_search_provider() -> SearchProvider:
    key = os.environ.get("tavily_api_key")
    return TavilySearchProvider(key) if key else MockSearchProvider()

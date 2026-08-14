"""Organization registry lookups, real and mocked, behind one interface.

The honest finding this module exists to make visible: **registry coverage is a data
problem, not an engineering one.** Programmatic charity registers exist for a handful
of wealthy, mostly English-speaking jurisdictions. For Indonesia, Pakistan, Nigeria,
Mali, Bosnia — where a platform like LaunchGood actually sees volume — there is no
queryable register at all, at any price.

So a live lookup succeeds for a US or UK organization and returns nothing for most of
the world, and that asymmetry is the point rather than a gap to paper over. A verified
result here means something; an absent one frequently means "this country has no API",
not "this organization is suspicious". The pipeline already treats absence as a weak
signal, and `provider` on each result records which of the two you are looking at.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Literal, Protocol

import httpx

logger = logging.getLogger(__name__)

OrgStatus = Literal["verified", "lapsed", "revoked", "absent", "not_applicable"]

TIMEOUT = 8.0


@dataclass
class RegistryResult:
    status: OrgStatus
    detail: str
    provider: str
    record: dict | None = None


class RegistryProvider(Protocol):
    name: str

    def covers(self, country: str) -> bool: ...
    def lookup(self, organizer_name: str, country: str) -> RegistryResult | None: ...


class ProPublicaRegistry:
    """US 501(c)(3) organizations via ProPublica's Nonprofit Explorer.

    No API key, no registration, derived from IRS filings. The one real registry in
    this system that anyone cloning the repo can exercise immediately.
    """

    name = "propublica"
    URL = "https://projects.propublica.org/nonprofits/api/v2/search.json"

    def covers(self, country: str) -> bool:
        return _normalize_country(country) in {"united states", "usa", "us"}

    def lookup(self, organizer_name: str, country: str) -> RegistryResult | None:
        resp = httpx.get(self.URL, params={"q": organizer_name}, timeout=TIMEOUT)

        # ProPublica answers a search with no hits using 404. That means "not on the
        # register", which is a finding — not a provider failure, which would fall
        # back and lose the fact that a real registry was successfully consulted.
        if resp.status_code == 404:
            return RegistryResult(
                "absent",
                f'No IRS-registered nonprofit matching "{organizer_name}" in the '
                f"ProPublica Nonprofit Explorer.",
                self.name,
            )

        resp.raise_for_status()
        orgs = resp.json().get("organizations", [])

        exact = [o for o in orgs if _same_name(o.get("name", ""), organizer_name)]
        if not exact:
            near = ", ".join(o.get("name", "") for o in orgs[:3])
            return RegistryResult(
                "absent",
                f'No IRS-registered nonprofit exactly matching "{organizer_name}" in the '
                f"ProPublica Nonprofit Explorer"
                + (f". Closest names returned: {near}." if near else "."),
                self.name,
            )

        org = exact[0]
        return RegistryResult(
            "verified",
            f'"{org.get("name")}" is an IRS-registered nonprofit (EIN {org.get("ein")}), '
            f'{org.get("city", "")}, {org.get("state", "")}. Source: ProPublica Nonprofit '
            f"Explorer, derived from IRS filings.",
            self.name,
            record=org,
        )


class CharityCommissionRegistry:
    """England & Wales charities via the Charity Commission API.

    Requires a free subscription key from api-portal.charitycommission.gov.uk. Without
    one the endpoint returns 401, so this stays inactive unless `charity_commission_key`
    is set.

    NOTE: written against the published API shape but NOT exercised against the live
    service, because obtaining a key requires a manual portal registration. Treat it as
    unverified until someone runs it with a real key.
    """

    name = "charity_commission"
    BASE = "https://api.charitycommission.gov.uk/register/api"

    def __init__(self, key: str) -> None:
        self.key = key

    def covers(self, country: str) -> bool:
        return _normalize_country(country) in {
            "united kingdom",
            "uk",
            "england",
            "wales",
            "great britain",
        }

    def lookup(self, organizer_name: str, country: str) -> RegistryResult | None:
        resp = httpx.get(
            f"{self.BASE}/searchCharityName/{organizer_name}",
            headers={"Ocp-Apim-Subscription-Key": self.key},
            timeout=TIMEOUT,
        )
        if resp.status_code == 404:
            return RegistryResult(
                "absent",
                f'No charity matching "{organizer_name}" on the Charity Commission '
                f"register for England and Wales.",
                self.name,
            )
        resp.raise_for_status()
        results = resp.json() or []

        exact = [c for c in results if _same_name(c.get("charity_name", ""), organizer_name)]
        if not exact:
            return RegistryResult(
                "absent",
                f'No exact match for "{organizer_name}" on the Charity Commission register.',
                self.name,
            )

        charity = exact[0]
        number = charity.get("reg_charity_number")
        registered = charity.get("charity_registration_status", "").lower()

        if registered and registered != "registered":
            return RegistryResult(
                "revoked" if "removed" in registered else "lapsed",
                f'"{charity.get("charity_name")}" appears on the Charity Commission '
                f"register (number {number}) with status: {registered}.",
                self.name,
                record=charity,
            )

        return RegistryResult(
            "verified",
            f'"{charity.get("charity_name")}" is a registered charity in England and '
            f"Wales, number {number}.",
            self.name,
            record=charity,
        )


def _normalize_country(country: str) -> str:
    return country.strip().lower().strip(".")


def _same_name(a: str, b: str) -> bool:
    return _clean(a) == _clean(b)


def _clean(name: str) -> str:
    dropped = {"the", "inc", "ltd", "limited", "trust", "foundation", "org"}
    words = [w for w in "".join(c if c.isalnum() else " " for c in name.lower()).split()]
    return " ".join(w for w in words if w not in dropped)


def live_providers() -> list[RegistryProvider]:
    providers: list[RegistryProvider] = [ProPublicaRegistry()]
    key = os.environ.get("charity_commission_key")
    if key:
        providers.append(CharityCommissionRegistry(key))
    return providers


def lookup_live(organizer_name: str, country: str) -> RegistryResult | None:
    """Try the real registries that cover this country. None means no coverage.

    A provider erroring is not the same as an organization being absent, so failures
    return None and let the caller fall back rather than manufacturing a clean or
    adverse result out of a timeout.
    """
    for provider in live_providers():
        if not provider.covers(country):
            continue
        try:
            return provider.lookup(organizer_name, country)
        except Exception as exc:  # noqa: BLE001
            logger.warning("registry %s failed for %r: %s", provider.name, organizer_name, exc)
            return None
    return None


def coverage_note(country: str) -> str:
    covered = [p.name for p in live_providers() if p.covers(country)]
    if covered:
        return f"Live registry coverage for {country}: {', '.join(covered)}."
    return (
        f"No live registry API covers {country}. This is the normal case: programmatic "
        f"charity registers exist for only a handful of jurisdictions, so an absent "
        f"result here reflects missing infrastructure rather than a finding about the "
        f"organization."
    )

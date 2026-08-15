"""The evidence bundle and the Source enum are one contract in two places."""

import re

from app.agent import prompts, tools
from app.agent.schemas import Source


def test_bundle_sources_are_valid():
    """Every section header the model can see must be a citable Source.

    This is the bug that took CMP-4480 down: the bundle labelled a section
    `media_metadata`, the model cited it, and Groq rejected the response because the
    enum had no such member. Retrying could never fix it — the prompt asked for
    something the schema forbade — so it looked like flakiness for fifteen attempts.
    """
    valid = {s.value for s in Source}

    for campaign in tools.load_campaigns():
        bundle = prompts.render_evidence_bundle(
            campaign,
            tools.org_registry_lookup(campaign),
            tools.duplicate_check(campaign),
            tools.compare_ask(campaign),
            tools.media_check(campaign, 2026),
            [],
            [],
        )
        headers = set(re.findall(r"^--- (\w+)", bundle, re.M))
        unrepresentable = headers - valid
        assert not unrepresentable, (
            f"{campaign['campaign_id']}: bundle shows section(s) {sorted(unrepresentable)} "
            f"that the Source enum cannot express, so any flag citing them is rejected."
        )

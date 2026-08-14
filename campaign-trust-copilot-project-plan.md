# Campaign Trust & Compliance Copilot — Build Plan

Purpose: working prototype for LaunchGood's Applied AI Engineer application. Deployed demo + video walkthrough. No submitted code, only a live link.

Paste this file into Claude Code as the project brief. Build phase by phase, in order. Each phase has a definition of done — do not move to the next phase until it's met.

## 1. Problem statement (fixed, do not change)

LaunchGood receives crowdfunding campaign submissions from 130+ countries. A small trust & safety team cannot manually vet every submission before it goes live and starts collecting donations. The system assists that team by gathering evidence from multiple sources, producing a structured risk assessment, and routing it to a human for a final decision. The AI never approves, rejects, or releases funds on its own.

Do not drift into a different problem mid-build. If a limitation surfaces, note it as a stated assumption or known limitation, do not silently change scope.

## 2. Stated assumptions (state these explicitly in the demo too)

- All campaign data, organizer registry data, and duplicate-campaign data are mocked. No real LaunchGood systems are touched.
- "Organization registry lookup" and "duplicate campaign check" are simulated with a local dataset, not a real external API.
- Web search for organizer legitimacy can use a real search API if available, or be mocked with canned results if not — pick one and say which in the video.
- The human reviewer is a single role for this prototype (no multi-tier escalation queue).
- Fund release, campaign publishing, and donor-facing actions are out of scope. The system stops at a recommendation plus a human decision log.

## 3. Stack decisions

- Backend: Python, FastAPI.
- Agent orchestration: LangGraph. State machine, not a single prompt-and-parse call, so the reasoning steps are visible and debuggable.
- LLM: Anthropic API (Claude). Use structured outputs (JSON schema / tool use) for the risk report, not free text parsing.
- Frontend: Next.js + Tailwind, single reviewer dashboard app. No separate admin/auth system needed for a prototype — a single unguarded route is fine, say so as a known limitation.
- Deployment: frontend on Vercel, backend on Render or Fly.io. Both need to be live for the submission link.
- Data store: SQLite or a JSON file is enough. Do not build a real database layer.

## 4. Folder structure

```
campaign-trust-copilot/
  backend/
    app/
      main.py
      agent/
        graph.py          # LangGraph state machine
        tools.py          # org_registry_lookup, duplicate_check, web_search
        schemas.py         # Pydantic models for the risk report contract
        prompts.py
      data/
        mock_campaigns.json
        mock_org_registry.json
        mock_past_campaigns.json
      eval/
        eval_cases.json     # labeled test campaigns with expected flags
        run_evals.py         # deterministic + LLM-as-judge scoring
      db.py                  # decision log storage
    requirements.txt
  frontend/
    app/
      queue/page.tsx         # list of submitted campaigns with risk score
      review/[id]/page.tsx   # detail view: evidence, flags, decision buttons
    components/
    lib/api.ts
  README.md                  # setup, run, and demo instructions
  ASSUMPTIONS.md              # mirrors section 2 above
```

## 5. Risk report contract (the core structured output)

Define this schema first, before writing any agent logic. Every downstream piece depends on it being stable.

```json
{
  "campaign_id": "string",
  "risk_score": "integer 0-100",
  "risk_tier": "low | medium | high",
  "flags": [
    {
      "type": "org_not_verified | duplicate_content | high_ask_no_track_record | inconsistent_claims | suspicious_media | other",
      "severity": "low | medium | high",
      "evidence": "string — what specifically triggered this, quoting or referencing the source",
      "source": "campaign_text | org_registry | duplicate_check | web_search"
    }
  ],
  "recommendation": "approve | manual_review | reject",
  "confidence": "float 0-1",
  "reasoning_summary": "2-3 sentence plain-language explanation for the human reviewer"
}
```

Definition of done: schema validated with Pydantic, agent output always conforms or the pipeline returns a typed error, never raw unstructured text to the frontend.

## 6. Agent pipeline (LangGraph state machine)

Nodes, in order:

1. `intake` — normalize the incoming campaign submission into a fixed internal shape.
2. `org_lookup` — check the mock organization registry for a match. No match is itself a signal, not a failure.
3. `duplicate_check` — compare campaign text/images against the mock past-campaigns set for near-duplicates.
4. `web_search` — look up the organizer/campaign name for independent corroboration or red flags.
5. `risk_synthesis` — LLM call that takes all evidence gathered so far and produces the structured risk report from section 5. This is the one node where the model must justify every flag with a source, no unsupported flags allowed.
6. `human_handoff` — write the report to the decision log with status `pending_review`. This is the hard boundary. Nothing past this node executes without a human action.

Definition of done: you can trace, for any flag in the final report, exactly which node produced the evidence behind it.

## 7. Human-in-the-loop boundary (the part they are grading hardest)

- The agent's output is a recommendation with a confidence score. It is never auto-applied.
- Every AI-generated flag must carry its evidence and source inline, visible in the UI, not just a bare label. A reviewer should never have to trust a flag without seeing why it fired.
- The human reviewer has three actions: approve, reject, escalate (send to a second reviewer — can be a stub for the prototype).
- Every human decision is logged with: campaign ID, AI recommendation, AI confidence, human decision, whether the human agreed or overrode, timestamp.
- This decision log is also your eval data. Say this explicitly in the video: disagreement between AI recommendation and human decision is the signal you'd monitor in production to catch model drift or systematic blind spots.

## 8. Eval framework

Three layers, all required:

1. **Deterministic checks** — schema validity, flags always cite a source, risk_score bounds, no campaign silently skipped.
2. **LLM-as-judge** — a second Claude call scores whether each flag's evidence actually supports the flag, on a held-out labeled set of 10-15 mock campaigns you construct with known expected outcomes (a mix of clean, obviously fraudulent, and ambiguous cases).
3. **Human agreement rate** — from the decision log described in section 7. Track agreement rate over the labeled set as the ground-truth-adjacent metric.

Definition of done: `run_evals.py` runs against `eval_cases.json` and prints a pass/fail summary plus the agreement rate. This does not need to be wired into real CI for the prototype, but say in the video how you'd wire it into CI.

## 9. Mock data to build

- 12-15 mock campaigns spanning: clean/legitimate, missing org verification, near-duplicate of a past campaign, unusually high ask with no history, inconsistent claims (e.g. photos don't match described location), and a genuinely ambiguous case with no clear answer. The ambiguous case matters — it's what you'll spend the most time discussing in the video.
- A small mock org registry (10-20 orgs, some verified, most not).
- A small mock past-campaigns set for duplicate detection.

## 10. Frontend

- Queue view: list of campaigns with risk tier badge, sorted by risk score descending.
- Detail view: campaign content, each flag as its own card with evidence and source, AI recommendation and confidence, three decision buttons.
- After a decision, show it logged and the campaign leaves the pending queue.
- No auth, no polish beyond clean and legible. This is a working tool, not a marketing site — the design should read as "professional internal tool," not "SaaS product."

## 11. Deployment checklist

- Backend deployed and reachable, CORS configured for the frontend origin.
- Frontend deployed with the backend URL as an environment variable, not hardcoded.
- Seed data loaded automatically on backend startup, no manual setup step for the reviewer to hit "empty state."
- Test the full flow end to end on the deployed URLs, not just locally, before recording the video.

## 12. Video walkthrough outline (record last, ≤5 minutes)

1. 30 sec: the problem, in plain terms, and your stated assumptions.
2. 90 sec: walk through one clean campaign and one clearly fraudulent one through the pipeline, showing the evidence trail.
3. 90 sec: walk through the ambiguous case. This is where you show judgment, not just working software.
4. 60 sec: the human/AI boundary decision. Why the AI stops where it stops, what happens when the AI is wrong in each direction, what you'd measure in production.
5. 30 sec: what you'd build next with more time (multi-tier escalation, real registry integration, drift monitoring on the eval set).

## 13. Explicitly out of scope

- Real authentication or multi-user roles.
- Real payment/fund-release integration.
- A production-grade database.
- Multilingual handling beyond noting it as a known limitation and a next step — LaunchGood campaigns span many languages and your fraud signals will be weaker outside English; say this out loud rather than pretending the prototype handles it.

## 14. Definition of done for the whole submission

- Live frontend URL and live backend URL, both reachable without login.
- A README with setup/run instructions and the same assumptions listed in section 2.
- A recorded video under 5 minutes covering the outline in section 12.
- The submission PDF lists both links plus the video link.

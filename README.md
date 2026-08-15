# Campaign Trust & Compliance Copilot

A human-in-the-loop triage system for crowdfunding campaign review. It gathers evidence
about a submitted campaign from several sources, produces a structured risk report where
every flag carries the evidence that triggered it, and routes the result to a human
reviewer who makes the actual decision.

The AI never approves, rejects, or releases funds.

Built as a prototype for LaunchGood's Applied AI Engineer application. All data is
mocked — see [ASSUMPTIONS.md](ASSUMPTIONS.md).

---

## The problem

LaunchGood receives campaign submissions from 130+ countries. A small trust & safety team
cannot manually vet every submission before it goes live and starts collecting donations.
Reviewing carelessly funds fraud; reviewing slowly starves legitimate disaster-relief
campaigns of the donations they need in their first 48 hours. Both failures are expensive
and they pull in opposite directions.

So the job is not "detect fraud." It is: **get a reviewer to the right decision faster,
without ever making the decision for them.**

## Where the line sits

The load-bearing design choice is which half of the work is deterministic.

| | Owner | Why |
|---|---|---|
| Is this organization in the registry? | **Code** | A lookup. Four states — verified, lapsed, revoked, absent — not a boolean. |
| Do these images appear in a past campaign? | **Code** | A set intersection plus text similarity. |
| Is this ask unusual? | **Code** | A ratio against the median first-time ask, computed from the data. |
| **Is the ask 6x the median because it's fraud, or because it's a hospital?** | **Model** | Judgment. |
| **Do these claims contradict each other?** | **Model** | Requires reading. |
| **Does the evidence actually support this concern?** | **Model** | Requires reading. |
| What is the risk score? | **Code** | So "why 78 and not 65?" has an answer. |
| What should happen to this campaign? | **Human** | Always. |

**The model never emits the risk score.** It is computed in `scoring.py`: high-severity
flags weigh 35, medium 15, low 5, summed and capped at 100, with fixed tier thresholds.
Same flags in, same score out, every time. Letting the model produce the number would look
like more AI and be strictly less defensible — the honest answer to "why 78?" would be
"it generated a plausible number," and a rerun would give a different one.

Three flag types (`org_not_verified`, `duplicate_content`, `high_ask_no_track_record`) are
**reserved to the deterministic layer** and stripped if the model emits them. This was not
a precaution: the model was observed raising `high_ask_no_track_record` for an ask at
1.09x the median, on a campaign where the arithmetic had already correctly declined to
raise it. A lookup is not a matter of opinion.

What is left for the model is the part no rules engine can do — and it is the harder part.

## Failure modes, and what happens in each

| Failure | Behaviour |
|---|---|
| A tool node throws | The node absorbs it. The report is still produced from partial evidence, and `sources_unavailable` records which checks did not run — so an absent flag is never mistaken for a clean result. |
| The model invents a flag | Reserved types are stripped; flags citing a source that returned nothing are dropped. |
| The model contradicts itself | `approve` alongside a high-severity flag is clamped to `manual_review`, and the override is logged and shown in the UI. |
| Synthesis fails entirely | A typed error envelope, rendered as "needs manual triage." The campaign sorts *above* scored ones — a submission nobody could assess needs a human sooner than one scored low. |
| Groq rate-limits | Retried honouring `retry-after`. Distinguished from a malformed request, which is never retried, and from an exhausted daily quota, which advances the model chain. |
| The model cites a source the schema forbids | Fixed at the root: the bundle's section headers and the `Source` enum are one contract, and a test fails if they drift. A schema rejection is also fed back into the conversation rather than blind-retried. |
| The campaign text tries to instruct the model | Treated as untrusted input, ignored, and recorded as a high-severity flag. Test case `CMP-4481`. |

One honest characteristic: **model-authored flags vary between runs, deterministic ones do
not.** Re-running `CMP-4480` produced a score of 15 once and 30 another time, as the model
raised one concern versus two about the same geo-tag mismatch. The variance is bounded to
the judgment half, and the score arithmetic never moves on its own — which is the strongest
practical argument for keeping lookups and ratios out of the model's hands.

## Evaluation

```bash
cd backend
uv run python -m app.eval.run_evals              # all three layers
uv run python -m app.eval.run_evals --no-judge   # deterministic only, no API calls
uv run python -m app.eval.run_evals --live       # re-run the pipeline first
```

Current state:

```
DETERMINISTIC   13/14 cases pass          (14/14 on gpt-oss-120b)
  clean               4/4  (0 false positives)
  ambiguous           2/3
LLM-AS-JUDGE    16/16 flags judged supported (100%)
SUMMARY AUDIT   3/3 ambiguous-case summaries explain their flags rather than naming them
CALIBRATION     2/2 planted fabrications caught
```

**These numbers are model-dependent, and that is the point of having them.** The suite
scored 14/14 on `gpt-oss-120b` and 13/14 after dropping to `gpt-oss-20b`. The remaining
failure is `CMP-4476`, and it is a measured capability gap rather than a guess: running
that one campaign through both models, 20b raises no model-authored flag while 120b
raises the unverifiable-affiliation concern at medium severity. Same prompt, same
evidence. Swapping models without an eval suite would have made that silent.

Two regressions the swap exposed were fixed properly rather than absorbed:

- 20b confidently approved the flagship ambiguous case at 0.85 where 120b had deferred.
  Rather than tune the prompt harder, "approve requires some independent corroboration
  of the organizer" became a deterministic clamp. **A rule that matters that much should
  not depend on which model is configured.**
- 20b called "run for six years" inconsistent with a source saying "since 2020" on a
  2026 submission. It had no way to know the current year, so the bundle now states the
  submission date.

Three things worth noting about how this is built:

**Expected values come from the mock data, not from a model run.** Writing down what the
model produced and calling it the expected output tests self-agreement, not correctness.

**The judge is calibrated against planted lies before it is trusted.** It is fed a report
containing two fabricated flags — a revoked registration and a duplicate match that appear
nowhere in the bundle — and must catch both. A judge incapable of failing anything
manufactures confidence rather than measuring it.

**The summary audit exists because keyword matching could not do the job.** `CMP-4475`'s
summary passed every string check and was still wrong: it pointed at a duplicate-content
flag without explaining that the matched images were the organizer's *own* earlier
successful campaign — the entire reason that flag is benign. "Beyond the already-recorded
flag" and a real explanation share nearly all their vocabulary. That distinction is
semantic, which is what the judge layer is for. It sits at 1/2 and is reported rather than
tuned away.

The eval also caught a mistake in my own test data: on a campaign I had labelled clean,
the model noticed that £10 × 300 parcels does not fit a $3,000 ask. It was right and the
fixture was wrong.

## The ambiguous cases

These matter more than the obvious ones.

- **`CMP-4474` — individual medical campaign.** No registry entry, because individuals are
  never in an organization registry. No web presence, which is normal for a private
  person. A 12-day-old account and an ask near the median. Nothing here is adverse on its
  own, yet every claim rests on documents nobody in the pipeline can check. The registry
  node returns `not_applicable` and raises nothing — a naive implementation would flag
  every individual campaign on the platform. The correct output is `manual_review` with
  low confidence and no flags at all: **raising nothing and being certain are different
  things.**

- **`CMP-4475` — verified organizer reusing its own photos.** A recurring seasonal qurbani
  campaign reuses images from its own completed campaigns. `duplicate_content` fires, but
  severity is driven by *provenance*, not similarity: matching your own successful
  campaign is categorically unlike matching someone else's rejected one. Severity `low`,
  score 5.

- **`CMP-4476` — unverifiable claimed affiliation.** Claims partnership with a verified
  charity; the organizer is a different five-day-old account, and search surfaces that
  charity's own partner list, which contains no such group. Affiliation-borrowing is
  arguably more dangerous than an unknown organizer, because the harm lands on the named
  charity too.

## Running it

Requires Python 3.13+ (`uv`), Node 20+, and Docker for Postgres. Put `groq_api_key` and
`groq_model` in a `.env` at the repo root.

```bash
# postgres → localhost:55432
docker compose up -d

# backend  → http://localhost:8000
cd backend && uv sync && uv run uvicorn app.main:app --reload

# frontend → http://localhost:3000
cd frontend && npm install && npm run dev
```

The queue is populated at startup from a committed seed, so there is no empty state and
no dependency on fourteen cold API calls. **"Re-run assessment"** on any campaign runs the
full pipeline live against the model. To rebuild the seed: `uv run python -m app.build_seed`.

Cost is about **$0.0003 per campaign** on `gpt-oss-20b` (~1.9k prompt + ~600 completion
tokens), roughly 2 seconds each.

**Model fallback.** `groq_model` takes a comma-separated chain, cheapest-capable first:

```
groq_model=openai/gpt-oss-20b,openai/gpt-oss-120b,openai/gpt-oss-safeguard-20b
```

Groq returns 429 both for "you are going too fast" and for "you are out of tokens for
today", and only the message separates them. Backing off on the second wastes the entire
retry budget on a call that cannot succeed until tomorrow — so a daily quota is detected
and the chain advances to the next model instead, mid-run, rather than failing the batch.
Falling back is a real change in behaviour and not a transparent retry, so `/api/health`
reports the active model and any that were exhausted. Nobody should be reading output from
a model they did not choose without knowing it.

The chain is validated at startup against models verified by direct API call to
produce strict structured output. That check exists because the obvious candidates
do not work, and each failure is different:

| Model | Why it is not in the chain |
|---|---|
| `llama-3.3-70b-versatile`, `llama-3.1-8b-instant` | Reject `json_schema` outright. |
| `groq/compound` | Rejects `json_schema` — and its 429 names `gpt-oss-120b` as what it routes to, so it draws on the quota of the very model it would be backing up. |
| `qwen/qwen3.6-27b` | Accepts the schema and works on short prompts, but returns an empty generation on the real bundle: a reasoning model that spends its budget before emitting JSON. Permitted, but not a default. |

A fallback that cannot satisfy the contract is an outage with extra steps, so
misconfiguration fails loudly at startup rather than silently under load.

**Quota observability.** `/api/health` reports live rate-limit state per model, scraped
from response headers. Groq publishes remaining per-*minute* capacity on every response
but exposes no endpoint and no header for the per-*day* token quota — that number appears
only inside the text of the 429 announcing you have hit it. Both are captured, and the
distinction is kept honest: the minute window can be watched ahead of time, the daily one
can only be recorded after the fact.

```json
"openai/gpt-oss-20b": {
  "tokens_remaining_this_minute": "8000",
  "tokens_per_day": 200000,
  "tokens_used_today": 199219
}
```

## Trying it live

The seeded queue is the fast path. To see the pipeline actually run:

**Submit a campaign** (nav bar) runs the real graph against whatever you type and
streams each node as it completes — registry lookup, duplicate comparison, ask ratio,
search, model synthesis — with real timings. "Fill in a real example" uses an actual
US-registered charity, so the registry step performs a genuine live API call rather
than reading a fixture.

Two things worth doing on camera:

- Put an instruction to the model in the campaign text. It gets flagged rather than
  obeyed, and the deterministic flags cannot be talked out of at all.
- Submit the same organiser with a non-US location. The registry step falls back to
  the local dataset and says so, because no live register covers that country.

**Sign in** is required — the console approves and rejects live fundraising campaigns,
and once a form triggers model calls an open endpoint is also someone else's bill.
Create an account with:

```bash
cd backend && uv run python -m app.create_user yourname
```

## Storage

Postgres. `database_url` defaults to the `docker compose` instance, so local setup is
`docker compose up -d` and nothing else — migrations run on boot.

Assessments are a cache and are truncated and re-seeded on every start. **Decisions are
never dropped**, which is the whole reason this is not a SQLite file: free-tier disks are
ephemeral, and the decision log is the one artefact here a human authored.

There is deliberately **no foreign key** from `decisions.campaign_id` to `assessments`. A
foreign key would either block the re-seed or cascade away the one table nobody can
regenerate.

Constraints live in the schema, not only in Pydantic — `ai_confidence` between 0 and 1,
`risk_score` between 0 and 100, and the recommendation/decision/outcome enums are all
`CHECK`ed, so a bug in the app cannot write a decision the domain does not allow.

## Layout

```
backend/app/
  agent/
    schemas.py        the contract — ModelFlag (what the LLM may say) vs Flag (adds origin)
    graph.py          6-node LangGraph state machine
    tools.py          registry, duplicates, ask ratio, media metadata, search providers
    scoring.py        deterministic score, tier, and recommendation clamp
    prompts.py        evidence bundle + the three system prompts
    synthesis_llm.py  the Groq call, retry classification, token accounting
  eval/               eval_cases.json, run_evals.py
  db.py               decision log, assessment cache, submitted campaigns
  auth.py             scrypt hashing + signed bearer tokens, stdlib only
  agent/registries.py real registry providers (ProPublica live, Charity Commission)
  migrations/         numbered .sql, applied in order, tracked in schema_migrations
frontend/app/         queue rail, review/[id], decisions
```

## What I would build next

1. **Multilingual signal parity.** The single biggest correctness gap — see ASSUMPTIONS.
2. **Wire the evals into CI**, gating on the clean-subset false-positive rate rather than
   overall pass rate. False positives cost legitimate organizers money and cost reviewers
   their trust in the tool, and that is the number that should block a merge.
3. **Drift monitoring on the override rate** from the decision log, sliced by campaign
   category and country. A rising override rate in one slice is how a systematic blind
   spot becomes visible before it becomes a scandal.
4. **Calibrate the severity weights against outcomes** instead of my judgment.
5. **Real registry integrations**, starting with the UK Charity Commission and Canada CRA,
   both of which have usable APIs.

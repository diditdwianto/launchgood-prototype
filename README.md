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

## Every flag is a claim, not a verdict

A risk score alone answers "how worried should I be" but not "why" — and "why" is what a
reviewer actually needs before overriding an AI recommendation on a live campaign. So
every flag, deterministic or model-authored, carries its full reasoning rather than a
one-line label:

```
claim              the specific assertion under examination
sources[]           every source consulted, each an exact quote — never a paraphrase
reasoning           how the sources support or conflict with the claim
finding_confidence  confidence in THIS finding, distinct from the report-level confidence
uncertainty         what remains unverified, stated plainly — never empty
contradiction       true only when two sources make claims that cannot both be true
next_action         none · verify_manually · request_more_information · reject_recommended
```

A flag with one source is a settled fact rendered the same way a contradiction is — the
schema makes both look like a chain, because neither is allowed to be just a conclusion.
`sources` cannot be empty (`min_length=1`), and the eval suite's structural checks go
further than the schema does: `contradiction=True` with fewer than two sources fails the
suite, as does a blank `claim`, `reasoning`, or `uncertainty` — a required field that is
allowed to be empty is not actually required.

The console shows this as an expandable "evidence chain" under each flag — click it and
the claim, every source, and (when two sources disagree) a contradiction banner render as
a small graph, closer to how the reviewer would reconstruct the reasoning by hand than to
a risk-score readout.

**This did not come free.** Asking for seven structured fields per flag instead of two
roughly doubled completion size, which pushed testing straight into Groq's per-minute
token cap mid-session — see the rate-limit fallback fix below, found and fixed by hitting
it directly. It also measurably increased how often the model manufactured a minor `other`
flag about an ordinary, unprovable narrative detail — a landlord's verbal permission, "we
have run this before" — treating "nothing in the bundle proves this exact sentence" as a
finding, which is the opposite of the platform's own stated philosophy that absence of
evidence is not evidence. Measured before any fix: 2/3 runs on one campaign, 1/3 on two
others. The prompt now names the pattern by example rather than only stating the rule in
the abstract, and after that the clean-case false-positive rate returned to 0/4.

## Request more information — a human-approved message, not an automated one

Some findings resolve by asking the organiser directly. When a flag's `next_action` is
`request_more_information`, the console offers to draft a message: the model writes a
specific, single-claim request naming exactly what could not be verified and what would
resolve it, in the campaign's own language. A reviewer reads it, can edit every word, and
nothing happens until they click **Send**.

No email is actually dispatched — that integration is out of scope for a prototype, see
[ASSUMPTIONS.md](ASSUMPTIONS.md). What is real is the audit trail: `clarification_requests`
records who drafted it, whether it was edited before sending, who clicked Send, and when.
That log, not the delivery, is the actual answer to the human-in-the-loop question — an
AI-drafted action that touches someone outside the system does not fire without an
explicit, attributed human approval.

## Failure modes, and what happens in each

| Failure | Behaviour |
|---|---|
| A tool node throws | The node absorbs it. The report is still produced from partial evidence, and `sources_unavailable` records which checks did not run — so an absent flag is never mistaken for a clean result. |
| The model invents a flag | Reserved types are stripped; flags citing a source that returned nothing are dropped. |
| The model contradicts itself | `approve` alongside a high-severity flag is clamped to `manual_review`, and the override is logged and shown in the UI. |
| Synthesis fails entirely | A typed error envelope, rendered as "needs manual triage." The campaign sorts *above* scored ones — a submission nobody could assess needs a human sooner than one scored low. |
| Groq rate-limits | Retried honouring `retry-after`. Distinguished from a malformed request, which is never retried, and from an exhausted daily quota, which advances the model chain. |
| The model cites a source the schema forbids | Fixed at the root: the bundle's section headers and the `Source` enum are one contract, and a test fails if they drift. A schema rejection is also fed back into the conversation rather than blind-retried. |
| A model exhausts its retries — daily quota, per-minute limit, or repeated malformed output | The chain now falls through to the next model for any of these, not only a daily quota. Found directly: a per-minute 429 on `gpt-oss-20b` used to fail the whole assessment instead of trying `gpt-oss-120b`, which had headroom. Only a genuine daily-quota exhaustion is remembered for the rest of the process; a per-minute limit is retried fresh on the next campaign. |
| Groq's real 429 wait time isn't where the code expected it | Found by inspecting a live 429: Groq never sends the standard `Retry-After` header, only `x-ratelimit-reset-tokens` in its own `1m26.4s`-style format. Every retry before this fix was guessing with blind exponential backoff instead of reading the number the server actually sent. |
| The campaign text tries to instruct the model | Treated as untrusted input, ignored, and recorded as a high-severity flag. Test case `CMP-4481`. |
| "Draft a request" fired the model twice per click | React StrictMode double-invokes effects in development to catch missing cleanup — and a draft call triggered from a `useEffect` on prop change is exactly the kind of unguarded side effect it exists to catch. Confirmed directly: two draft rows with an identical `drafted_at` timestamp to the second, from one click. A `useRef` guard makes the effect idempotent per open; a real click is not re-invoked by StrictMode, so the guard costs nothing on a genuine second request. |

**Search proves existence, never identity.** Found by submitting a live campaign named
after BAZNAS, Indonesia's national zakat agency. Search returned abundant evidence that
BAZNAS is real and official, and the pipeline read that as corroboration of a
30-day-old account with no history — approving it at 0.8 confidence. The two claims are
separate: *this organisation is legitimate* and *this submitter is that organisation*.
Conflating them makes the best-known charities the easiest to impersonate, because the
more famous the name, the more supporting material a search returns.

Identity corroboration now requires a registry hit; web presence does not count. The
same campaign is now `manual_review` at 0.6 with the summary "possible impersonation of
a well-known charity". This lives in `scoring.clamp` rather than only in the prompt —
it is the second rule moved into code after a model talked itself out of it.

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
DETERMINISTIC   12/14 cases pass
  clean               4/4  (0 false positives)
  ambiguous           1/3
```

**These numbers are model-dependent, and that is the point of having them.** The suite
has scored anywhere from 12/14 to 14/14 depending on which model in the chain answered
and which sample it drew — every committed seed is one sample, not an ensemble. The two
cases that actually flicker are both instructive rather than random:

- `CMP-4476` (the affiliation-borrowing case) needs the model to *add* a flag the
  deterministic layer cannot produce on its own. Measured directly: three consecutive
  calls to the exact same model on the exact same evidence produced clean, flagged,
  flagged. This was first described here as a clean capability gap between `gpt-oss-20b`
  and `gpt-oss-120b` — that framing did not survive more testing. It is noisy across
  every model in the chain, including the ones assumed reliable. The honest fix is not a
  bigger model, it is treating this specific finding as inherently uncertain and saying
  so, which is exactly what `finding_confidence` on the flag itself is for.
- `CMP-4474` (the flagship ambiguous case) occasionally reports 0.75–0.85 confidence
  against an instruction that says stay under 0.7. Same shape of variance, different rule.

Swapping models, or even just re-running the same one, without an eval suite would have
made both of these invisible instead of documented.

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
model_chain=openai/gpt-oss-20b,openai/gpt-oss-120b,openai/gpt-oss-safeguard-20b,nvidia/nemotron-3-super-120b-a12b
```

Ordered fast first, durable last, and it spans two providers. Groq and NVIDIA both
expose OpenAI-compatible endpoints, so this is one client against two base URLs rather
than two vendor SDKs.

The three Groq models answer in 1.5–3s but are capped at **200,000 tokens per model per
day**; once that is gone it is gone until tomorrow. The NVIDIA model is measured at
**19–33s** warm and is limited **per minute** instead, so it does not run out. The
system therefore degrades to slow rather than to broken — which is the right direction
for a tool a reviewer is sitting in front of.

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
| Groq `llama-3.3-70b-versatile`, `llama-3.1-8b-instant` | Reject `json_schema` outright. |
| Groq `groq/compound` | Rejects `json_schema` — and its 429 names `gpt-oss-120b` as what it routes to, so it draws on the quota of the very model it would be backing up. |
| Groq `qwen/qwen3.6-27b` | Accepts the schema and works on short prompts, but returns an empty generation on the real bundle: a reasoning model that spends its budget before emitting JSON. Permitted, but not a default. |
| NVIDIA `mistral-large-2-instruct`, `kimi-k2.6` | 404 on this tier. |
| NVIDIA `llama-3.3-70b-instruct` | Exceeded 90s on every attempt. |
| NVIDIA `meta/llama-3.1-8b-instruct` | The only fast NVIDIA option at 2.0s, but 8B, and it emitted flag types the prompt reserves to the deterministic layer. |

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

**Under the hood** (nav bar) is readable **without signing in**, so the design can be
inspected without being handed the keys to the console. It explains the pipeline in plain terms and reports the
model layer live: the fallback chain, per-model pricing, remaining per-minute tokens,
token spend this process, and which evidence sources are real versus mocked.
"Check live limits" refreshes the rate-limit headers, and is restricted to signed-in
reviewers: refreshing spends tokens, so an anonymous button that did it would be a
quota drain with a UI. Anonymous visitors get the cached snapshot, and the database
host is redacted for them.

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

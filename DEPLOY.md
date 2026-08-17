# Deploy runbook

Both URLs must be live and reachable without login. The posting states that a submission
missing either the deployed demo or the video is rejected outright, so this is a hard gate,
not a finishing touch.

Order matters: **backend first**, because the frontend needs its URL at build time.

---

## 0. Environment variables

Two example files document every variable this app reads — copy each one and fill in
real values rather than inventing the list from scratch:

| File | Copy to | Scope |
|---|---|---|
| `.env.example` (repo root) | `.env` | Backend: model provider keys, database, auth, CORS |
| `frontend/.env.example` | `frontend/.env.local` | Frontend: where the backend lives |

Both copies are gitignored; the `.example` files are not, so they stay the source of
truth for what a fresh checkout needs.

**The one that matters for this section's heading:** `NEXT_PUBLIC_API_BASE` in
`frontend/.env.example` is the backend's host, as far as the frontend is concerned. It
already reads from the environment in `frontend/lib/api.ts` — nothing to change there —
but the value itself is not tied to Render. It works identically whether the backend is
a Render service URL, a custom domain, or a bare VPS IP (`http://203.0.113.10:8000`):
whatever you put here is what the deployed frontend calls. The walkthrough below uses
Render because it's free and needs zero code changes for this project's shape (see the
"Vercel-only" question this doc's companion conversation already answered), but nothing
past this point assumes it.

Locally, both files' hardcoded fallbacks (`http://localhost:8000` for the frontend,
`docker-compose.yml`'s Postgres for the backend) mean the app runs with **no `.env` file
at all** — the copies only start mattering once you need a real model key or a
non-localhost backend.

---

## 1. Backend → Render

1. Push to GitHub, then at [dashboard.render.com](https://dashboard.render.com) create a
   **New Web Service** from the repo.
2. Settings:

   | Field | Value |
   |---|---|
   | Root directory | `backend` |
   | Runtime | Python 3 |
   | Build command | `pip install uv && uv sync --frozen` |
   | Start command | `uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
   | Instance type | Free is sufficient — but read §4 |

3. Environment variables (the full list, with what each does, lives in `.env.example`
   at the repo root — this is the subset that actually matters for a first deploy):

   | Key | Value |
   |---|---|
   | `groq_api_key` | your key |
   | `model_chain` | `openai/gpt-oss-20b,openai/gpt-oss-120b,openai/gpt-oss-safeguard-20b,nvidia/nemotron-3-super-120b-a12b` |
   | `nvidia_build_api_key` | *optional* — enables the NVIDIA tail of the chain |
   | `cors_origins` | set **after** step 2, to the exact Vercel origin |
   | `database_url` | **required** — the Postgres URL; see step 1a |
   | `PYTHON_VERSION` | `3.13.3` |

   The model value is a fallback chain, fast first and durable last, spanning Groq and
   NVIDIA. Each Groq model has its own daily token quota; when one runs out the next
   takes over mid-run. The NVIDIA model at the end is limited per minute rather than per
   day, so it does not run out — it is the reason a spent quota degrades the demo to
   slow instead of breaking it. Only models verified to support strict `json_schema` are
   accepted; the app refuses to start otherwise.

   Do not set `tavily_api_key` — leaving it unset keeps the demo deterministic.

4. Verify: `curl https://<your-service>.onrender.com/api/health` should return
   `{"ok":true, ..., "assessed":14}`.

   `assessed:14` is the check that matters. It confirms the seed loaded and the reviewer
   will not open an empty queue.

### 1a. Postgres

Render → **New → PostgreSQL** (the free instance is ample), then copy its **Internal**
Database URL into the web service as `database_url`. Tables are created on first boot by
the migration runner; there is no manual setup step.

The decision log lives here and survives redeploys. Assessments still re-seed on every
start, so only human decisions persist — which is the intent.

## 2. Frontend → Vercel

1. At [vercel.com/new](https://vercel.com/new), import the same repo.
2. Set **Root Directory** to `frontend`. Framework preset (Next.js) is detected.
3. Environment variable (see `frontend/.env.example` for the full explanation):

   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_API_BASE` | `https://<your-service>.onrender.com` |

   No trailing slash. This is the backend's host — swap in a custom domain or a bare
   VPS IP here instead and nothing else in this step changes. It's inlined at build
   time, so **changing it later requires a redeploy**, not just a restart.

4. Deploy, then copy the production URL.

## 3. Close the CORS loop

Set `cors_origins` on Render to the exact Vercel origin (e.g.
`https://campaign-trust-copilot.vercel.app`, no trailing slash) and let it restart.

Leaving it at the `*` default will work, but setting it properly is the correct posture
and costs nothing.

## 4. Before recording — read this one

Render's free tier **sleeps after 15 minutes idle**, and the first request afterwards takes
30–60 seconds. On camera that is a dead pause with nothing to narrate.

Either:

- **Load the deployed frontend a minute or two before you hit record**, and keep the tab
  open; or
- put the service on Render's cheapest paid instance for the week you are submitting.

If a reviewer opens your link cold, they will hit the same delay. If that concerns you,
the paid instance is worth it for the submission window.

## 5. End-to-end check on the deployed URLs

Do this against the live URLs, not localhost.

- [ ] Queue loads with 14 campaigns, sorted by risk score descending
- [ ] `CMP-4471` detail: three flags, each showing evidence, source, and a rule/model tag
- [ ] "Show the exact evidence bundle" expands
- [ ] "Re-run assessment" completes and updates the report — this is the live model call
- [ ] Approve / Reject / Escalate each log a decision and remove the campaign from the queue
- [ ] Decision log shows the outcome as agreed / overrode / deferred
- [ ] `CMP-4474` shows `manual_review` at low confidence with **no** flags

## 6. Submission

- Frontend URL (the one to lead with)
- Backend URL — link `/api/health` or `/docs` rather than the bare root
- Video link, under 5 minutes

---

### Notes

**Decisions survive redeploys; assessments do not.** Assessments are a cache rebuilt
from the committed seed on every boot. That is deliberate — but it means the queue
resets to 14 pending on each deploy, while anything you decided stays in the log.

**Rebuilding the seed is a local operation.** Run `uv run python -m app.build_seed`, commit
the updated `backend/app/data/seed_assessments.json`, and push. Never set
`reassess_on_start=1` in production — it makes cold start depend on fourteen model calls
landing inside the free tier's rate limit, which is the exact failure this design avoids.

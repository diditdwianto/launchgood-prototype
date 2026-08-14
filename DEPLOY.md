# Deploy runbook

Both URLs must be live and reachable without login. The posting states that a submission
missing either the deployed demo or the video is rejected outright, so this is a hard gate,
not a finishing touch.

Order matters: **backend first**, because the frontend needs its URL at build time.

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

3. Environment variables:

   | Key | Value |
   |---|---|
   | `groq_api_key` | your key |
   | `groq_model` | `openai/gpt-oss-120b` |
   | `cors_origins` | set **after** step 2, to the exact Vercel origin |
   | `db_path` | `/tmp/trust_copilot.db` |
   | `PYTHON_VERSION` | `3.13.3` |

   Do not set `tavily_api_key` — leaving it unset keeps the demo deterministic.

4. Verify: `curl https://<your-service>.onrender.com/api/health` should return
   `{"ok":true, ..., "assessed":14}`.

   `assessed:14` is the check that matters. It confirms the seed loaded and the reviewer
   will not open an empty queue.

## 2. Frontend → Vercel

1. At [vercel.com/new](https://vercel.com/new), import the same repo.
2. Set **Root Directory** to `frontend`. Framework preset (Next.js) is detected.
3. Environment variable:

   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_API_BASE` | `https://<your-service>.onrender.com` |

   No trailing slash. This is inlined at build time, so **changing it later requires a
   redeploy**, not just a restart.

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

**The decision log resets on redeploy**, since SQLite lives on ephemeral disk. That is
fine and intended for a prototype — but do not record a walkthrough, redeploy, and expect
your logged decisions to still be there.

**Rebuilding the seed is a local operation.** Run `uv run python -m app.build_seed`, commit
the updated `backend/app/data/seed_assessments.json`, and push. Never set
`reassess_on_start=1` in production — it makes cold start depend on fourteen model calls
landing inside the free tier's rate limit, which is the exact failure this design avoids.

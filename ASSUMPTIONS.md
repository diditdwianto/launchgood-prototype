# Assumptions and known limitations

Stated up front because most of them are load-bearing. If any of these were different,
parts of the design would change.

## What is mocked

- **All campaign, organizer, registry and past-campaign data is fabricated.** No real
  LaunchGood system is touched. Names, registration numbers and URLs are invented, and
  the `example-*.org` domains in the search fixtures are deliberately non-resolving.

  One caveat found the hard way: invented charity names are not unique. Searching the
  fixtures' organisers returns real organisations — "Alamgir Relief Trust" surfaces the
  real Alamgir Welfare Trust, "Ummah Welfare Aid" surfaces Ummah Welfare Trust. **Live
  web search is therefore restricted to campaigns submitted through the console; the
  fixtures always use canned results.** Otherwise the demo would present a real
  charity's web presence as evidence inside a fabricated fraud case, which is unfair to
  that charity regardless of intent, and would also make the eval suite's expected
  outcomes depend on live search results.
- **Organization registry lookup** runs against a local 14-entry JSON file, not a real
  national registry API.
- **Duplicate detection** does real text-similarity computation (`difflib`) on campaign
  bodies. Image matching is **not** real: each image carries a pre-seeded `fingerprint`
  string standing in for a perceptual hash. There is no vision model anywhere in this
  pipeline.
- **Web search** is live via Tavily for submitted campaigns when `tavily_api_key` is
  set, and canned for the fixtures (see above). Both implement the same
  `SearchProvider` interface. A search failure is contained by the node and recorded in
  `sources_unavailable` rather than being read as "nothing found".
- **`inconsistent_claims` and `suspicious_media`** are detected from pre-seeded metadata
  (image geo tags, capture dates) compared against the campaign's own text. This is
  metadata comparison, not image forensics.

## Deviations from the original brief

- **The brief specifies Anthropic Claude; this uses Groq with `openai/gpt-oss-20b`,
  falling back to NVIDIA `nemotron-3-super-120b-a12b`.**
  The provider was swapped for credential availability. It was verified before any
  pipeline code was written that this model family honours `response_format: json_schema`
  with `strict: true`, which is what the structured-output requirement depends on.
  The pipeline was originally built and tuned against `gpt-oss-120b` and moved down to the
  20b after exhausting the larger model's token quota — the model is a single environment
  variable (`groq_model`), and pricing for both is in `synthesis_llm.py`.
- **LangGraph is used without `langchain-groq`.** Nodes are plain Python functions calling
  the `groq` SDK directly. One less abstraction over the exact `response_format` behaviour
  that needed observing.

## Scope boundaries

- **The AI never decides.** It produces a recommendation and a confidence. Approve, reject
  and escalate exist only as human actions recorded in the decision log. Fund release,
  campaign publishing and any donor-facing action are out of scope entirely — the system
  stops at a recommendation plus a logged human decision.
- **No authentication.** A single unguarded reviewer route. There is one reviewer role,
  and "escalate" records the intent to send to a second reviewer without implementing a
  second queue.
- **Postgres, for persistence rather than scale.** The original brief said not to build
  a real database layer; that constraint was lifted deliberately, because the decision
  log is the one artefact here a human authored and it doubles as the eval data. On a
  free-tier host the disk is ephemeral, so a SQLite file was being wiped on every
  restart and redeploy. Assessments are still cleared and re-seeded at startup — they
  are a cache — but decisions are never dropped.

  Still not an ORM. Two tables, no relations, and the value is in constraints and
  indexes rather than object mapping, so it is raw psycopg with numbered `.sql`
  migrations recorded in `schema_migrations`. SQLAlchemy would sit on top of queries
  worth reading directly, and Alembic would add a config tree for two files of DDL.
  With relations or a team, that tradeoff flips.
- **English only.** LaunchGood campaigns span many languages and every fraud signal here
  is weaker outside English: the duplicate-text similarity, the injection detection, and
  the model's reading of campaign claims all degrade. This is a real limitation of the
  prototype, not a detail — it is not handled, and pretending otherwise would be worse
  than saying so.

## Things that are honestly imperfect

- **The judge and the synthesis model are the same model.** Self-preference bias applies.
  The eval output says so on every run rather than presenting the judge as independent.
- **The summary audit currently scores 1/2.** One ambiguous-case summary names its flag
  without explaining it. This is reported rather than tuned away — an eval that always
  passes is not measuring anything.
- **Human agreement rate is deliberately not reported as a percentage.** Every label here
  was written by the same person who would be clicking the buttons. With a handful of
  decisions that number would be an anecdote dressed as a metric. The decision log
  captures the data and defines it as the production drift signal; it does not claim a
  result today.
- **Model-authored flags vary between runs; deterministic flags do not.** At temperature
  0.2, re-running the same campaign can produce a different set of model flags — `CMP-4480`
  scored 15 in one run and 30 in another, as the model raised one concern versus two about
  the same geo-tag mismatch. The deterministic layer is stable by construction, so the
  variance is bounded to the judgment half and the score arithmetic never moves on its own.
  This is a real property of the system rather than a bug, and it is the strongest practical
  argument for keeping lookups and arithmetic out of the model's hands. Reducing it further
  would mean lower temperature, self-consistency sampling, or a fine-tune — all production
  concerns.
- **The scoring weights (high 35 / medium 15 / low 5) are a judgment call, not a
  calibration.** They are fixed and visible so the score is reproducible and auditable,
  which is the property that matters at prototype stage. Choosing them from outcome data
  is a production concern.
- **Assessments are served from a committed seed.** Cold start is instant and does not
  depend on fourteen model calls landing inside a free tier's rate limit. The live
  pipeline runs on demand via the "Re-run assessment" action.

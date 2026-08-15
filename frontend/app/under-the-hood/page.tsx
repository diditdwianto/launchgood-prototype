"use client";

import { useCallback, useEffect, useState } from "react";

import { Empty, SectionLabel } from "@/components/ui";
import { getTelemetry, Unauthorized, type Telemetry } from "@/lib/api";

const PIPELINE = [
  {
    node: "intake",
    owner: "code",
    what: "Normalises the submission and rejects anything missing required fields.",
  },
  {
    node: "org_lookup",
    owner: "code",
    what: "Checks the organiser against a registry. Four states — verified, lapsed, revoked, absent — plus not-applicable for individuals, who are never listed in an org register.",
  },
  {
    node: "duplicate_check",
    owner: "code",
    what: "Text similarity against past campaigns, plus image-fingerprint overlap. Severity comes from provenance: reusing your own successful campaign's photos is not the same act as reusing a rejected stranger's.",
  },
  {
    node: "ask_and_media",
    owner: "code",
    what: "Ask as a ratio of the median first-time ask, and image geo/date metadata against the claimed location. Computes the facts; raises a flag only for the ratio.",
  },
  {
    node: "web_search",
    owner: "code",
    what: "Looks for independent corroboration of the organiser.",
  },
  {
    node: "risk_synthesis",
    owner: "model",
    what: "Reads everything gathered and decides what the automated checks could not: whether claims contradict each other, whether media fits the story, whether someone is trying to manipulate the reviewer.",
  },
  {
    node: "human_handoff",
    owner: "human",
    what: "Writes the report as pending_review. The hard boundary — nothing downstream of this executes, because there is no downstream.",
  },
];

const SPLIT = [
  ["Is this organisation registered?", "code", "A lookup."],
  ["Do these images appear in a past campaign?", "code", "A set intersection."],
  ["Is this ask unusual?", "code", "A ratio against the median."],
  [
    "Is the ask 6× the median because it's fraud, or because it's a hospital?",
    "model",
    "Judgment.",
  ],
  ["Do these claims contradict each other?", "model", "Requires reading."],
  ["What is the risk score?", "code", "So “why 78?” has an answer."],
  ["What happens to this campaign?", "human", "Always."],
] as const;

const OWNERS = [
  {
    key: "code",
    title: "Code",
    rule: "Owns anything settled by a lookup or arithmetic.",
    wrongness:
      "A deterministic function: same input, same output, always. It can be wrong — but only because the rule is wrong, and then it is wrong identically on every campaign, which makes it findable and fixable.",
  },
  {
    key: "model",
    title: "Model",
    rule: "Owns only what cannot be written as a rule.",
    wrongness:
      "A language model reading text and exercising judgment. It can be wrong differently on each run, so it is never given anything that has to be reproducible — no scores, no arithmetic, no lookups.",
  },
  {
    key: "human",
    title: "Human",
    rule: "Owns the decision. Always.",
    wrongness:
      "Code computes and the model recommends; neither approves anything. A person can be wrong too, but they can see every piece of evidence behind the recommendation, and their name is on the outcome.",
  },
];

const OWNER_STYLE: Record<string, string> = {
  code: "bg-brand-tint text-brand-deep",
  model: "bg-medium-tint text-medium",
  human: "bg-high-tint text-high",
};

export default function UnderTheHoodPage() {
  const [data, setData] = useState<Telemetry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);

  const load = useCallback((probe: boolean) => {
    if (probe) setProbing(true);
    getTelemetry(probe)
      .then(setData)
      .catch((e) =>
        e instanceof Unauthorized
          ? (window.location.href = "/login")
          : setError(String(e)),
      )
      .finally(() => setProbing(false));
  }, []);

  useEffect(() => load(false), [load]);

  if (error) return <Empty title="Could not load telemetry" hint={error} />;
  if (!data) return <Empty title="Loading…" />;

  return (
    <div className="mx-auto max-w-[860px] px-10 py-7">
      <h1 className="mb-1.5 text-[22px] font-semibold tracking-tight">
        Under the hood
      </h1>
      <p className="text-muted mb-8 max-w-[660px] text-[13.5px] leading-relaxed">
        A campaign goes through seven steps. Five gather evidence with ordinary code,
        one asks a language model to read that evidence, and the last one stops and
        waits for a person. The interesting design decision is not which model is
        used — it is <em>where the line sits</em> between those three.
      </p>

      {!data.signed_in ? (
        <p className="bg-panel border-brand/40 text-muted mb-8 max-w-[660px] rounded-lg border border-l-[3px] px-4 py-3 text-[13px] leading-relaxed">
          You are reading this signed out, which is intentional — the design should be
          inspectable without an account. The reviewer console itself needs one, because
          it approves and rejects live fundraising campaigns and its submit form spends
          real model tokens.
        </p>
      ) : null}

      <SectionLabel>What the three labels mean</SectionLabel>
      <div className="mb-3 grid grid-cols-3 gap-3">
        {OWNERS.map((o) => (
          <div key={o.key} className="bg-panel border-line rounded-lg border px-4 py-3.5">
            <div className="mb-2 flex items-center gap-2">
              <span
                className={`${OWNER_STYLE[o.key]} rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase`}
              >
                {o.key}
              </span>
              <span className="text-[13px] font-semibold">{o.title}</span>
            </div>
            <p className="text-ink mb-1.5 text-[12.5px] font-medium">{o.rule}</p>
            <p className="text-muted text-[12px] leading-relaxed">{o.wrongness}</p>
          </div>
        ))}
      </div>
      <p className="text-muted mb-8 max-w-[660px] text-[12.5px] leading-relaxed">
        The split is not about who touches the data — it is about{" "}
        <strong className="text-ink font-medium">
          who can be held to what kind of wrongness
        </strong>
        . Two consequences worth knowing:
        <br />
        <br />
        The label marks who owns the <em>decision</em> in a step, not who does the work
        in it. <span className="mono text-[11.5px]">ask_and_media</span> uses code to
        establish that the photos are geo-tagged Turkey while the campaign claims Gaza —
        that part is a comparison. Whether that amounts to a material inconsistency is a
        judgment, so it reaches the model as a fact rather than as a flag.
        <br />
        <br />
        And the model step is bounded by code on <em>both</em> sides. It receives a fixed
        evidence bundle, and afterwards its output has reserved flag types stripped, is
        clamped if it contradicts itself, and is scored arithmetically. The model is
        never the last word, even inside its own step.
      </p>

      <SectionLabel>The pipeline</SectionLabel>
      <ol className="bg-panel border-line mb-8 rounded-lg border">
        {PIPELINE.map((step, i) => (
          <li
            key={step.node}
            className="border-line flex gap-4 border-b px-4 py-3.5 last:border-b-0"
          >
            <span className="mono text-muted w-5 flex-shrink-0 pt-0.5 text-[11px]">
              {i + 1}
            </span>
            <div className="flex-1">
              <div className="mb-1 flex items-center gap-2">
                <span className="mono text-[12.5px] font-medium">{step.node}</span>
                <span
                  className={`${OWNER_STYLE[step.owner]} rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase`}
                >
                  {step.owner}
                </span>
              </div>
              <p className="text-muted text-[13px] leading-relaxed">{step.what}</p>
            </div>
          </li>
        ))}
      </ol>

      <SectionLabel>Who decides what</SectionLabel>
      <div className="bg-panel border-line mb-3 overflow-hidden rounded-lg border">
        {SPLIT.map(([question, owner, why]) => (
          <div
            key={question}
            className="border-line flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0"
          >
            <span className="flex-1 text-[13px]">{question}</span>
            <span className="text-muted w-[130px] text-[12px]">{why}</span>
            <span
              className={`${OWNER_STYLE[owner]} w-[52px] flex-shrink-0 rounded-full px-2 py-0.5 text-center text-[10px] font-semibold tracking-wide uppercase`}
            >
              {owner}
            </span>
          </div>
        ))}
      </div>
      <p className="text-muted mb-8 max-w-[660px] text-[12.5px] leading-relaxed">
        The model never emits the risk score. {data.scoring} Same flags in, same score
        out — so the number is auditable rather than plausible. Three flag types
        (unverified organisation, duplicate content, high ask) are reserved to the
        deterministic layer and discarded if the model emits them: it was once observed
        raising “high ask” for an ask at 1.09× the median that the arithmetic had
        correctly declined to raise.
      </p>

      <div className="mb-3 flex items-baseline justify-between">
        <SectionLabel>Model layer · {data.provider}</SectionLabel>
        {data.probe_available ? (
          <button
            onClick={() => load(true)}
            disabled={probing}
            className="text-muted hover:text-ink mb-3 text-[12.5px] underline underline-offset-4 disabled:opacity-40"
          >
            {probing ? "Checking…" : "Check live limits"}
          </button>
        ) : (
          <span
            className="text-muted mb-3 text-[12.5px]"
            title="Refreshing limits spends tokens, so it is reserved for signed-in reviewers."
          >
            cached snapshot
          </span>
        )}
      </div>

      <div className="mb-3 space-y-2.5">
        {data.chain.map((m) => {
          const perMin = Number(m.limits.tokens_per_minute ?? 0);
          const leftMin = Number(m.limits.tokens_remaining_this_minute ?? 0);
          const perDay = m.limits.tokens_per_day;
          const usedDay = m.limits.tokens_used_today;

          return (
            <div
              key={m.model}
              className={`bg-panel rounded-lg border px-4 py-3.5 ${
                m.exhausted
                  ? "border-high/40"
                  : m.active
                    ? "border-brand/50"
                    : "border-line"
              }`}
            >
              <div className="mb-2.5 flex items-center gap-2">
                <span className="mono text-muted text-[11px]">#{m.position}</span>
                <span className="mono text-[13px] font-medium">{m.model}</span>
                {m.active ? (
                  <span className="bg-brand-tint text-brand-deep rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                    active
                  </span>
                ) : null}
                {m.exhausted ? (
                  <span className="bg-high-tint text-high rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                    quota spent
                  </span>
                ) : null}
                <span className="mono text-muted ml-auto text-[11px]">
                  ${m.pricing.input_per_mtok}/M in · $
                  {m.pricing.output_per_mtok}/M out
                </span>
              </div>

              <Meter
                label="Tokens this minute"
                used={perMin - leftMin}
                total={perMin}
                caption={
                  perMin
                    ? `${leftMin.toLocaleString()} of ${perMin.toLocaleString()} left${
                        m.limits.tokens_reset_in
                          ? ` · resets in ${m.limits.tokens_reset_in}`
                          : ""
                      }`
                    : "not measured yet — use “Check live limits”"
                }
              />

              <Meter
                label="Tokens today"
                used={usedDay ?? 0}
                total={perDay ?? 0}
                caption={
                  perDay
                    ? `${(usedDay ?? 0).toLocaleString()} of ${perDay.toLocaleString()} used`
                    : "not published by the API — see the note below"
                }
              />

              <p className="mono text-muted mt-2.5 text-[11px]">
                this process: {m.usage.calls} call(s) ·{" "}
                {m.usage.prompt.toLocaleString()} in /{" "}
                {m.usage.completion.toLocaleString()} out · ${m.usage.usd.toFixed(5)}
              </p>
            </div>
          );
        })}
      </div>

      <p className="text-muted mb-8 max-w-[660px] text-[12.5px] leading-relaxed">
        Models are tried in order; when one&apos;s daily quota runs out the next takes
        over mid-run. Groq publishes remaining <em>per-minute</em> capacity on every
        response, but there is no endpoint and no header for the <em>per-day</em> quota
        — that number appears only inside the text of the 429 that announces you have
        hit it. So the daily bar stays empty until a model has actually been exhausted,
        and showing an estimate there instead would be inventing data.
      </p>

      <SectionLabel>Evidence sources</SectionLabel>
      <div className="bg-panel border-line mb-8 overflow-hidden rounded-lg border">
        <Row
          label="Organisation registry"
          value={data.registries.map((r) => r.name).join(", ") || "mock only"}
          note="ProPublica's Nonprofit Explorer is live and keyless for US organisations. No live register covers most of the 130+ countries this platform serves — that is missing public infrastructure, not a shortcut, and the bundle says which source answered."
          real
        />
        <Row
          label="Web search"
          value={data.search.provider}
          note={
            data.search.live
              ? "Live search API."
              : "Canned results keyed by organiser name. A real Tavily adapter implementing the same interface is written and activates when tavily_api_key is set."
          }
          real={data.search.live}
        />
        <Row
          label="Duplicate detection"
          value="text real, images mocked"
          note="Body similarity is genuinely computed. Image matching uses pre-seeded fingerprints standing in for a perceptual hash — there is no vision model here."
        />
        <Row label="Campaigns & past campaigns" value="mock dataset" note="14 fixtures with known expected outcomes, which the eval suite reads ground truth from." />
        <Row label="Decision log" value={data.database} real />
      </div>

      <SectionLabel>Cost this process</SectionLabel>
      <div className="bg-panel border-line mb-8 grid grid-cols-4 gap-px overflow-hidden rounded-lg border">
        <Stat label="Calls" value={String(data.totals.calls)} />
        <Stat
          label="Tokens"
          value={(
            data.totals.prompt_tokens + data.totals.completion_tokens
          ).toLocaleString()}
        />
        <Stat label="Spend" value={`$${data.totals.total_usd.toFixed(5)}`} />
        <Stat label="Avg latency" value={`${data.totals.avg_seconds}s`} />
      </div>

      <p className="mono text-muted text-[11px]">
        captured {data.captured_at} · counters are per server process and reset on
        restart
      </p>
    </div>
  );
}

function Meter({
  label,
  used,
  total,
  caption,
}: {
  label: string;
  used: number;
  total: number;
  caption: string;
}) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const tone = pct > 90 ? "bg-high" : pct > 70 ? "bg-medium" : "bg-brand";
  return (
    <div className="mb-2">
      <div className="text-muted mb-1 flex justify-between text-[11px]">
        <span>{label}</span>
        <span className="mono">{caption}</span>
      </div>
      <div className="bg-ground h-1.5 w-full overflow-hidden rounded-full">
        {total > 0 ? (
          <div className={`${tone} h-full rounded-full`} style={{ width: `${pct}%` }} />
        ) : null}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  note,
  real,
}: {
  label: string;
  value: string;
  note?: string;
  real?: boolean;
}) {
  return (
    <div className="border-line border-b px-4 py-3 last:border-b-0">
      <div className="flex items-center gap-2.5">
        <span className="w-[210px] flex-shrink-0 text-[13px] font-medium">{label}</span>
        <span className="mono text-muted flex-1 text-[12px]">{value}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${
            real ? "bg-low-tint text-low" : "bg-medium-tint text-medium"
          }`}
        >
          {real ? "live" : "mocked"}
        </span>
      </div>
      {note ? (
        <p className="text-muted mt-1.5 max-w-[640px] text-[12px] leading-relaxed">
          {note}
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-panel px-4 py-3.5">
      <div className="mono text-[19px] leading-none font-medium">{value}</div>
      <div className="text-muted mt-1.5 text-[10.5px] tracking-wide uppercase">
        {label}
      </div>
    </div>
  );
}

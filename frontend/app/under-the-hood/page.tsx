"use client";

import { useCallback, useEffect, useState } from "react";

import { Empty, SectionLabel } from "@/components/ui";
import { getTelemetry, Unauthorized, type Telemetry } from "@/lib/api";

const PIPELINE = [
  {
    node: "intake",
    owner: "code",
    what: "Normalises the submission. Rejects anything missing a required field.",
  },
  {
    node: "org_lookup",
    owner: "code",
    what: "Checks the organiser against a registry. Returns one of five states: verified, lapsed, revoked, absent, or not-applicable for individuals.",
  },
  {
    node: "duplicate_check",
    owner: "code",
    what: "Compares body text and image fingerprints against past campaigns. Severity is set by provenance, not by similarity score.",
  },
  {
    node: "ask_and_media",
    owner: "code",
    what: "Computes the ask as a ratio of the median first-time ask. Compares image geo tags and capture dates against the claimed location. Raises a flag for the ratio only.",
  },
  {
    node: "web_search",
    owner: "code",
    what: "Searches for independent mentions of the organiser.",
  },
  {
    node: "risk_synthesis",
    owner: "model",
    what: "Reads the assembled evidence. Adds flags for contradictions, media mismatches and manipulation attempts. Writes the reviewer summary.",
  },
  {
    node: "human_handoff",
    owner: "human",
    what: "Writes the report as pending_review. No step runs after this one.",
  },
];

const SPLIT = [
  ["Is this organisation registered?", "code", "A lookup."],
  ["Do these images appear in a past campaign?", "code", "A set intersection."],
  ["Is this ask unusual?", "code", "A ratio against the median."],
  [
    "Is a 6× ask fraud, or a hospital bill?",
    "model",
    "Judgment.",
  ],
  ["Do these claims contradict each other?", "model", "Requires reading."],
  ["What is the risk score?", "code", "Arithmetic from flags."],
  ["Approve, reject, or escalate?", "human", "Never delegated."],
] as const;

const OWNERS = [
  {
    key: "code",
    title: "Code",
    rule: "Campaign filtering by lookup or arithmetic.",
    detail:
      "Deterministic function to filter campaigns based on pre-defined rules. Same input, same output.",
  },
  {
    key: "model",
    title: "Model",
    rule: "Campaign filtering by using AI.",
    detail:
      "A language model exercising judgment from system input that cannot be enumerated as a rule by Code.",
  },
  {
    key: "human",
    title: "Human",
    rule: "Campaign decision by a reviewer.",
    detail:
      "The only actor that approves, rejects, or escalates. Code and Model produce recommendations only.",
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
        A campaign passes through seven steps. Five gather evidence using code, one
        uses a language model, one stops for a human. Each step below is labelled by
        which of the three owns its decision.
      </p>

      {!data.signed_in ? (
        <p className="bg-panel border-brand/40 text-muted mb-8 max-w-[660px] rounded-lg border border-l-[3px] px-4 py-3 text-[13px] leading-relaxed">
          Signed out. This page is public. The reviewer console requires an account:
          it approves and rejects campaigns, and the submit form spends model tokens.
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
            <p className="text-muted text-[12px] leading-relaxed">{o.detail}</p>
          </div>
        ))}
      </div>
      <p className="text-muted mb-8 max-w-[660px] text-[12.5px] leading-relaxed">
        Two clarifications.
        <br />
        <br />
        The label marks decision ownership, not workload.{" "}
        <span className="mono text-[11.5px]">ask_and_media</span> uses Code to compare
        image geo tags against the claimed location. The comparison is arithmetic;
        classifying the result as an inconsistency is judgment, so it reaches Model as a
        fact rather than a flag.
        <br />
        <br />
        Model output is bounded by Code on both sides. It receives a fixed evidence
        bundle. Its output then has reserved flag types stripped, contradictory
        recommendations clamped, and the score computed arithmetically.
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
        Model does not produce the risk score. {data.scoring} The same flags always
        produce the same score. Three flag types — unverified organisation, duplicate
        content, high ask — are reserved to Code and discarded if Model emits them.
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
            title="Refreshing limits spends tokens. Signed-in reviewers only."
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
        Models are tried in order. When one model&apos;s daily quota is exhausted, the
        next takes over mid-run. Groq returns remaining per-minute capacity on every
        response. Per-day usage has no endpoint and no header — it appears only in the
        429 that reports it — so the daily bar fills in only after a model has been
        exhausted.
      </p>

      <SectionLabel>Evidence sources</SectionLabel>
      <div className="bg-panel border-line mb-8 overflow-hidden rounded-lg border">
        <Row
          label="Organisation registry"
          value={data.registries.map((r) => r.name).join(", ") || "mock only"}
          note="ProPublica Nonprofit Explorer. Live, keyless, US organisations only. No live register covers most of the 130+ countries on this platform. The evidence bundle records which source answered."
          real
        />
        <Row
          label="Web search"
          value={data.search.provider}
          note={
            data.search.live
              ? "Tavily runs on submitted campaigns. The 14 fixtures keep canned results: their organiser names are invented but every one collides with a real charity, so live search would attach a real organisation's web presence to a fabricated fraud case, and would break the expected outcomes the eval suite reads."
              : "Canned results keyed by organiser name. A Tavily adapter implementing the same interface activates when tavily_api_key is set."
          }
          real={data.search.live}
        />
        <Row
          label="Duplicate detection"
          value="text real, images mocked"
          note="Body text similarity is computed. Image matching uses pre-seeded fingerprints in place of a perceptual hash. No vision model."
        />
        <Row label="Campaigns & past campaigns" value="mock dataset" note="14 fixtures with known expected outcomes. The eval suite reads ground truth from these." />
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
        captured {data.captured_at} · counters are per server process, reset on restart
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

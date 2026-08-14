"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Empty, SectionLabel } from "@/components/ui";
import { getDecisions, type DecisionEntry } from "@/lib/api";

const OUTCOME_STYLE: Record<DecisionEntry["outcome"], string> = {
  agreed: "bg-low-tint text-low",
  overrode: "bg-high-tint text-high",
  deferred: "bg-medium-tint text-medium",
};

export default function DecisionsPage() {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof getDecisions>
  > | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDecisions().then(setData).catch((e) => setError(String(e)));
  }, []);

  if (error) return <Empty title="Could not load the decision log" hint={error} />;
  if (!data) return <Empty title="Loading…" />;

  return (
    <div className="mx-auto max-w-[820px] px-10 py-7">
      <h1 className="mb-1.5 text-[22px] font-semibold tracking-tight">
        Decision log
      </h1>
      <p className="text-muted mb-6 max-w-[620px] text-[13.5px] leading-relaxed">
        Every human decision, recorded against what the AI recommended. This log
        is also the eval data: in production, a rising override rate is the
        signal that the model has drifted or has a systematic blind spot.
      </p>

      <div className="mb-7 grid grid-cols-3 gap-3">
        <Stat label="Decisions" value={String(data.total)} />
        <Stat
          label="Agreed / decisive"
          value={data.agreement}
          hint="Only approve and reject recommendations can be agreed with. Reported as a fraction, because a handful of decisions from one reviewer is not a rate."
        />
        <Stat
          label="Deferred"
          value={String(data.deferred)}
          hint="The AI recommended manual_review — declining to predict rather than being right or wrong."
        />
      </div>

      <SectionLabel>Entries</SectionLabel>

      {data.entries.length === 0 ? (
        <p className="bg-panel border-line text-muted rounded-lg border px-4 py-3.5 text-sm">
          No decisions logged yet. Review a campaign from the queue to populate
          this.
        </p>
      ) : (
        <div className="bg-panel border-line overflow-hidden rounded-lg border">
          {data.entries.map((e, i) => (
            <div
              key={i}
              className="border-line flex items-center gap-4 border-b px-4 py-3 last:border-b-0"
            >
              <Link
                href={`/review/${e.campaign_id}`}
                className="mono text-brand-deep w-[86px] flex-shrink-0 text-[12px] hover:underline"
              >
                {e.campaign_id}
              </Link>

              <div className="mono text-muted flex-1 text-[12px]">
                ai <span className="text-ink">{e.ai_recommendation}</span>{" "}
                <span className="text-line">·</span> conf{" "}
                <span className="text-ink">{e.ai_confidence.toFixed(2)}</span>{" "}
                <span className="text-line">·</span> score{" "}
                <span className="text-ink">{e.ai_risk_score}</span>
                <span className="text-line"> → </span>
                human <span className="text-ink">{e.human_decision}</span>
                {e.reviewer_note ? (
                  <span className="text-muted block pt-0.5 font-sans text-[12px] italic">
                    “{e.reviewer_note}”
                  </span>
                ) : null}
              </div>

              <span
                className={`${OUTCOME_STYLE[e.outcome]} flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase`}
              >
                {e.outcome}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div
      className="bg-panel border-line rounded-lg border px-4 py-3.5"
      title={hint}
    >
      <div className="mono text-[24px] leading-none font-medium">{value}</div>
      <div className="text-muted mt-1.5 text-[11px] tracking-wide uppercase">
        {label}
      </div>
    </div>
  );
}

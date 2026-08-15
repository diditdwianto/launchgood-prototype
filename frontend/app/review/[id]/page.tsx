"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import FlagCard from "@/components/FlagCard";
import { QUEUE_CHANGED } from "@/components/QueueRail";
import { Empty, SectionLabel, TierBadge } from "@/components/ui";
import {
  getCampaign,
  postDecision,
  reassess as reassessCampaign,
  Unauthorized,
  usd,
  type CampaignDetail,
  type Decision,
} from "@/lib/api";

const SCORE_COLOR = { low: "text-low", medium: "text-medium", high: "text-high" };

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<CampaignDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [showBundle, setShowBundle] = useState(false);

  const load = useCallback(() => {
    getCampaign(id)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => e instanceof Unauthorized ? (window.location.href = "/login") : setError(String(e)));
  }, [id]);

  useEffect(() => {
    setData(null);
    setNote("");
    setShowBundle(false);
    load();
  }, [load]);

  async function decide(decision: Decision) {
    setBusy(decision);
    try {
      await postDecision(id, decision, note);
      window.dispatchEvent(new Event(QUEUE_CHANGED));
      router.push("/decisions");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function reassess() {
    setBusy("reassess");
    try {
      await reassessCampaign(id);
      load();
      window.dispatchEvent(new Event(QUEUE_CHANGED));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  if (error) return <Empty title="Could not load this campaign" hint={error} />;
  if (!data) return <Empty title="Loading assessment…" />;

  const { campaign, assessment } = data;

  return (
    <div className="mx-auto max-w-[820px] px-10 py-7">
      <ol className="mb-5 flex flex-wrap items-center gap-1.5">
        {(assessment.status === "ok"
          ? assessment.report.trace
          : assessment.error.trace
        ).map((t, i, arr) => (
          <li key={t.node} className="flex items-center gap-1.5">
            <span
              title={`${t.summary} (${t.duration_ms}ms)`}
              className={`mono rounded px-2 py-1 text-[10.5px] ${
                t.status === "error"
                  ? "bg-high-tint text-high"
                  : "bg-brand-tint text-brand-deep"
              }`}
            >
              {t.node}
            </span>
            {i < arr.length - 1 ? (
              <span className="text-line text-xs">→</span>
            ) : null}
          </li>
        ))}
      </ol>

      <div className="mb-1.5 flex items-start justify-between gap-6">
        <h1 className="max-w-[540px] text-[22px] leading-tight font-semibold tracking-tight">
          {campaign.title}
        </h1>
        {assessment.status === "ok" ? (
          <div
            className="flex-shrink-0 text-right"
            title={data.scoring}
          >
            <div
              className={`mono text-[30px] leading-none font-medium ${SCORE_COLOR[assessment.report.risk_tier]}`}
            >
              {assessment.report.risk_score}
            </div>
            <div className="text-muted text-[11px] tracking-wide uppercase">
              risk score
            </div>
          </div>
        ) : null}
      </div>

      <p className="mono text-muted mb-5 text-[13px]">
        {campaign.campaign_id} · {campaign.organizer_name} (
        {campaign.organizer_type}) · goal {usd(campaign.goal_usd)} ·{" "}
        {campaign.claimed_location}
      </p>

      {assessment.status === "error" ? (
        <div className="border-high bg-high-tint mb-6 rounded-lg border-l-[3px] px-4 py-4">
          <p className="text-high mb-1 text-sm font-semibold">
            Assessment failed — needs manual triage
          </p>
          <p className="mono text-[12px] break-words">
            {assessment.error.code}: {assessment.error.message}
          </p>
          <p className="text-muted mt-2 text-[13px]">
            No recommendation was produced. This submission is queued ahead of
            scored ones rather than being treated as clean.
          </p>
        </div>
      ) : (
        <>
          <section className="bg-panel border-line mb-6 rounded-lg border px-4.5 py-4">
            <h2 className="text-brand-deep mb-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase">
              AI reasoning summary
            </h2>
            <p className="text-sm leading-relaxed">
              {assessment.report.reasoning_summary}
            </p>

            {assessment.report.clamp_applied ? (
              <p className="border-line text-medium mt-3 border-t pt-3 text-[12.5px]">
                <strong className="font-semibold">Override applied:</strong>{" "}
                {assessment.report.clamp_applied}
              </p>
            ) : null}

            {assessment.report.sources_unavailable.length > 0 ? (
              <p className="border-line text-high mt-3 border-t pt-3 text-[12.5px]">
                <strong className="font-semibold">Checks that did not run:</strong>{" "}
                {assessment.report.sources_unavailable.join(", ")}. Treat these as
                unknown, not clean.
              </p>
            ) : null}
          </section>

          <SectionLabel>
            Evidence trail · {assessment.report.flags.length}{" "}
            {assessment.report.flags.length === 1 ? "flag" : "flags"}
          </SectionLabel>

          {assessment.report.flags.length === 0 ? (
            <p className="bg-panel border-line text-muted mb-6 rounded-lg border px-4 py-3.5 text-sm">
              No flags raised. Every automated check passed and the model found
              nothing further in the campaign text.
            </p>
          ) : (
            assessment.report.flags.map((f, i) => <FlagCard key={i} flag={f} />)
          )}
        </>
      )}

      <SectionLabel>Campaign as submitted</SectionLabel>
      <div className="bg-panel border-line mb-6 rounded-lg border px-4.5 py-4">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {campaign.body}
        </p>
        <dl className="border-line text-muted mt-3.5 grid grid-cols-2 gap-x-6 gap-y-1.5 border-t pt-3.5 text-[12.5px]">
          <div className="flex justify-between">
            <dt>Account age</dt>
            <dd className="mono text-ink">
              {campaign.organizer_account_age_days} days
            </dd>
          </div>
          <div className="flex justify-between">
            <dt>Prior campaigns</dt>
            <dd className="mono text-ink">
              {campaign.prior_campaigns_on_platform}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt>Images</dt>
            <dd className="mono text-ink">{campaign.images.length}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Category</dt>
            <dd className="mono text-ink">{campaign.category}</dd>
          </div>
        </dl>
      </div>

      <button
        onClick={() => setShowBundle((v) => !v)}
        className="text-muted hover:text-ink mb-6 text-[12.5px] underline underline-offset-4 transition-colors"
      >
        {showBundle ? "Hide" : "Show"} the exact evidence bundle the model was given
      </button>
      {showBundle ? (
        <pre className="bg-panel border-line mono mb-6 overflow-x-auto rounded-lg border px-4 py-3.5 text-[11px] leading-relaxed whitespace-pre-wrap">
          {data.evidence_bundle}
        </pre>
      ) : null}

      {data.escalated ? (
        <div className="border-medium bg-medium-tint mb-5 rounded-lg border-l-[3px] px-4 py-3.5">
          <p className="text-medium mb-1 text-sm font-semibold">
            Escalated — awaiting a second reviewer
          </p>
          <p className="text-[13px] leading-relaxed">
            {data.history[0]?.decided_by
              ? `${data.history[0].decided_by} passed this on`
              : "A reviewer passed this on"}
            {data.history[0]?.reviewer_note
              ? `: “${data.history[0].reviewer_note}”`
              : "."}{" "}
            It stays in the queue until someone approves or rejects it.
          </p>
          <p className="text-muted mt-2 text-[12.5px]">
            Single-reviewer prototype: there is one account, so nothing prevents the
            same person deciding. In production this would route to a different one.
          </p>
        </div>
      ) : null}

      {data.history.length > 0 ? (
        <div className="border-line bg-panel mb-5 rounded-lg border px-4 py-3">
          <div className="text-muted mb-2 text-[11px] font-semibold tracking-[0.06em] uppercase">
            Decision history
          </div>
          {data.history.map((h, i) => (
            <div key={i} className="mono text-muted py-0.5 text-[12px]">
              {h.decided_at} · <span className="text-ink">{h.human_decision}</span>
              {h.decided_by ? ` by ${h.decided_by}` : ""} · {h.outcome}
            </div>
          ))}
        </div>
      ) : null}

      {data.decided ? (
        <div className="border-line bg-panel text-muted rounded-lg border px-4 py-3.5 text-sm">
          A final decision has been logged for this campaign.
        </div>
      ) : (
        <div className="bg-ground border-line sticky bottom-0 mt-6 border-t pt-5 pb-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reviewer note (optional) — why you decided what you decided"
            className="border-line bg-panel focus:border-brand mb-3 w-full rounded-lg border px-3.5 py-2.5 text-[13.5px] outline-none"
          />
          <div className="flex items-center gap-2.5">
            <button
              disabled={!!busy || assessment.status !== "ok"}
              onClick={() => decide("approve")}
              className="bg-brand hover:bg-brand-deep rounded-lg px-4.5 py-2.5 text-[13.5px] font-semibold text-white transition-colors disabled:opacity-40"
            >
              Approve
            </button>
            <button
              disabled={!!busy || assessment.status !== "ok"}
              onClick={() => decide("reject")}
              className="bg-high rounded-lg px-4.5 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:brightness-110 disabled:opacity-40"
            >
              Reject
            </button>
            <button
              disabled={!!busy || assessment.status !== "ok"}
              onClick={() => decide("escalate")}
              className="border-line hover:bg-panel rounded-lg border px-4.5 py-2.5 text-[13.5px] font-semibold transition-colors disabled:opacity-40"
            >
              {data.escalated ? "Escalate again" : "Escalate"}
            </button>
            <button
              disabled={!!busy}
              onClick={reassess}
              title="Re-run the full pipeline against the model right now"
              className="text-muted hover:text-ink ml-1 text-[12.5px] underline underline-offset-4 transition-colors disabled:opacity-40"
            >
              {busy === "reassess" ? "Re-running…" : "Re-run assessment"}
            </button>

            {assessment.status === "ok" ? (
              <span className="mono text-muted ml-auto text-[11.5px]">
                AI confidence{" "}
                <b className="text-ink">
                  {assessment.report.confidence.toFixed(2)}
                </b>{" "}
                · <b className="text-ink">{assessment.report.recommendation}</b>
              </span>
            ) : null}
          </div>
          <p className="text-muted mt-2.5 text-[11.5px]">
            The AI never approves, rejects, or releases funds. This is the only
            place a decision is made.
          </p>
        </div>
      )}
    </div>
  );
}

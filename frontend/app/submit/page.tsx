"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import FlagCard from "@/components/FlagCard";
import { QUEUE_CHANGED } from "@/components/QueueRail";
import { SectionLabel } from "@/components/ui";
import {
  streamUrl,
  submitCampaign,
  type Assessment,
  type NewCampaign,
  type NodeTrace,
} from "@/lib/api";

const NODE_LABELS: Record<string, string> = {
  intake: "Normalising the submission",
  org_lookup: "Checking organisation registries",
  duplicate_check: "Comparing against past campaigns",
  ask_and_media: "Comparing the ask and image metadata",
  web_search: "Searching for independent corroboration",
  risk_synthesis: "Model reading the evidence",
  human_handoff: "Handing off to a human reviewer",
};

const EMPTY: NewCampaign = {
  title: "",
  organizer_name: "",
  organizer_type: "organization",
  goal_usd: 5000,
  claimed_location: "",
  category: "other",
  body: "",
  organizer_account_age_days: 1,
  prior_campaigns_on_platform: 0,
};

// A real US charity, so the registry step performs a genuine lookup rather than
// falling back to the local dataset.
const EXAMPLE: NewCampaign = {
  title: "Emergency water pumps for drought-hit villages",
  organizer_name: "Zakat Foundation of America",
  organizer_type: "organization",
  goal_usd: 24000,
  claimed_location: "Bridgeview, United States",
  category: "water_sanitation",
  body: "A third failed rainy season has left twelve villages without a working water point. This campaign funds solar-powered pumps, transport and installation, with a maintenance agreement held by each village water committee. We have run comparable programmes for the last four years and publish handover reports.",
  organizer_account_age_days: 900,
  prior_campaigns_on_platform: 2,
};

export default function SubmitPage() {
  const router = useRouter();
  const [form, setForm] = useState<NewCampaign>(EMPTY);
  const [nodes, setNodes] = useState<NodeTrace[]>([]);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const source = useRef<EventSource | null>(null);

  function set<K extends keyof NewCampaign>(key: K, value: NewCampaign[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setRunning(true);
    setError(null);
    setNodes([]);
    setAssessment(null);

    try {
      const { campaign } = await submitCampaign(form);
      setCampaignId(campaign.campaign_id);

      const es = new EventSource(streamUrl(campaign.campaign_id));
      source.current = es;

      es.addEventListener("node", (ev) => {
        setNodes((prev) => [...prev, JSON.parse((ev as MessageEvent).data)]);
      });
      es.addEventListener("result", (ev) => {
        setAssessment(JSON.parse((ev as MessageEvent).data));
        setRunning(false);
        window.dispatchEvent(new Event(QUEUE_CHANGED));
        es.close();
      });
      es.addEventListener("failed", (ev) => {
        setError(JSON.parse((ev as MessageEvent).data).message);
        setRunning(false);
        es.close();
      });
      es.onerror = () => {
        // Fires on a dropped connection as well as a server error; either way the
        // stream is over and leaving the spinner up would be a lie.
        setRunning(false);
        es.close();
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRunning(false);
    }
  }

  const report = assessment?.status === "ok" ? assessment.report : null;

  return (
    <div className="mx-auto max-w-[820px] px-10 py-7">
      <h1 className="mb-1.5 text-[22px] font-semibold tracking-tight">
        Submit a campaign
      </h1>
      <p className="text-muted mb-6 max-w-[640px] text-[13.5px] leading-relaxed">
        Runs the real pipeline against whatever you enter. Organisation registry
        lookups hit a live API for US organisations; everywhere else falls back to
        the local dataset, because programmatic charity registers do not exist for
        most countries.{" "}
        <button
          type="button"
          onClick={() => setForm(EXAMPLE)}
          className="text-brand-deep underline underline-offset-4"
        >
          Fill in a real example
        </button>
      </p>

      <form onSubmit={run} className="bg-panel border-line mb-7 rounded-lg border p-5">
        <Field label="Campaign title">
          <input
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            className="input"
            required
            minLength={4}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Organiser name">
            <input
              value={form.organizer_name}
              onChange={(e) => set("organizer_name", e.target.value)}
              className="input"
              required
            />
          </Field>
          <Field label="Organiser type">
            <select
              value={form.organizer_type}
              onChange={(e) =>
                set("organizer_type", e.target.value as NewCampaign["organizer_type"])
              }
              className="input"
            >
              <option value="organization">Organisation</option>
              <option value="individual">Individual</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Goal (USD)">
            <input
              type="number"
              value={form.goal_usd}
              onChange={(e) => set("goal_usd", Number(e.target.value))}
              className="input"
              min={1}
              required
            />
          </Field>
          <Field label="Location — country matters for registry lookup">
            <input
              value={form.claimed_location}
              onChange={(e) => set("claimed_location", e.target.value)}
              placeholder="City, Country"
              className="input"
              required
            />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Field label="Category">
            <input
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Account age (days)">
            <input
              type="number"
              value={form.organizer_account_age_days}
              onChange={(e) => set("organizer_account_age_days", Number(e.target.value))}
              className="input"
              min={0}
            />
          </Field>
          <Field label="Prior campaigns">
            <input
              type="number"
              value={form.prior_campaigns_on_platform}
              onChange={(e) => set("prior_campaigns_on_platform", Number(e.target.value))}
              className="input"
              min={0}
            />
          </Field>
        </div>

        <Field label="Campaign text">
          <textarea
            value={form.body}
            onChange={(e) => set("body", e.target.value)}
            rows={6}
            required
            minLength={20}
            maxLength={4000}
            className="input resize-y"
          />
          <p className="text-muted mt-1 text-[11.5px]">
            {form.body.length}/4000 · treated as untrusted input — try an
            instruction aimed at the model and watch it get flagged instead of
            obeyed.
          </p>
        </Field>

        <button
          type="submit"
          disabled={running}
          className="bg-brand hover:bg-brand-deep rounded-lg px-5 py-2.5 text-[13.5px] font-semibold text-white transition-colors disabled:opacity-40"
        >
          {running ? "Assessing…" : "Run assessment"}
        </button>
      </form>

      {nodes.length > 0 || running ? (
        <>
          <SectionLabel>
            Pipeline {campaignId ? `· ${campaignId}` : ""}
          </SectionLabel>
          <ol className="bg-panel border-line mb-7 rounded-lg border">
            {Object.keys(NODE_LABELS).map((name) => {
              const done = nodes.find((n) => n.node === name);
              const active = running && !done && nodes.length > 0;
              return (
                <li
                  key={name}
                  className="border-line flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0"
                >
                  <span
                    className={`mono w-[15px] text-[13px] ${
                      done?.status === "error"
                        ? "text-high"
                        : done
                          ? "text-low"
                          : "text-line"
                    }`}
                  >
                    {done?.status === "error" ? "✕" : done ? "✓" : "·"}
                  </span>
                  <span className="mono text-muted w-[132px] text-[11px]">
                    {name}
                  </span>
                  <span
                    className={`flex-1 text-[13px] ${done ? "text-ink" : "text-muted"}`}
                  >
                    {done ? done.summary : NODE_LABELS[name]}
                  </span>
                  {done ? (
                    <span className="mono text-muted text-[11px]">
                      {done.duration_ms}ms
                    </span>
                  ) : active ? (
                    <span className="text-muted text-[11px]">…</span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </>
      ) : null}

      {error ? (
        <div className="border-high bg-high-tint mb-6 rounded-lg border-l-[3px] px-4 py-3.5">
          <p className="text-high text-sm font-semibold">Assessment failed</p>
          <p className="mono mt-1 text-[12px] break-words">{error}</p>
        </div>
      ) : null}

      {assessment?.status === "error" ? (
        <div className="border-high bg-high-tint mb-6 rounded-lg border-l-[3px] px-4 py-3.5">
          <p className="text-high text-sm font-semibold">
            Assessment failed — needs manual triage
          </p>
          <p className="mono mt-1 text-[12px] break-words">
            {assessment.error.code}: {assessment.error.message}
          </p>
        </div>
      ) : null}

      {report ? (
        <>
          <div className="bg-panel border-line mb-5 flex items-start justify-between gap-6 rounded-lg border px-4.5 py-4">
            <div>
              <div className="text-brand-deep mb-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase">
                AI reasoning summary
              </div>
              <p className="text-sm leading-relaxed">{report.reasoning_summary}</p>
              <p className="mono text-muted mt-2.5 text-[11.5px]">
                confidence <b className="text-ink">{report.confidence.toFixed(2)}</b> ·{" "}
                <b className="text-ink">{report.recommendation}</b>
              </p>
            </div>
            <div className="flex-shrink-0 text-right">
              <div
                className={`mono text-[30px] leading-none font-medium ${
                  report.risk_tier === "high"
                    ? "text-high"
                    : report.risk_tier === "medium"
                      ? "text-medium"
                      : "text-low"
                }`}
              >
                {report.risk_score}
              </div>
              <div className="text-muted text-[11px] tracking-wide uppercase">
                risk score
              </div>
            </div>
          </div>

          <SectionLabel>
            Evidence · {report.flags.length}{" "}
            {report.flags.length === 1 ? "flag" : "flags"}
          </SectionLabel>
          {report.flags.length === 0 ? (
            <p className="bg-panel border-line text-muted mb-5 rounded-lg border px-4 py-3.5 text-sm">
              No flags raised.
            </p>
          ) : (
            report.flags.map((f, i) => <FlagCard key={i} flag={f} />)
          )}

          <button
            onClick={() => router.push(`/review/${campaignId}`)}
            className="border-line hover:bg-panel rounded-lg border px-4.5 py-2.5 text-[13.5px] font-semibold transition-colors"
          >
            Open in reviewer console →
          </button>
        </>
      ) : null}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <label className="text-muted mb-1.5 block text-[11px] font-semibold tracking-[0.06em] uppercase">
        {label}
      </label>
      {children}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect } from "react";

const OWNER_STYLE: Record<string, string> = {
  code: "bg-brand-tint text-brand-deep",
  model: "bg-medium-tint text-medium",
  human: "bg-high-tint text-high",
};

const HAVE = [
  {
    title: "Prepared data",
    body:
      "14 seeded campaigns with known, hand-checked outcomes drive the queue and the eval suite — plus mock organiser accounts and duplicate-image fingerprints to compare against.",
  },
  {
    title: "Manual submission",
    body:
      "“Submit a campaign” runs the real pipeline end-to-end on whatever you enter — an actual registry lookup, an actual web search, and a real model call. It spends live tokens.",
  },
  {
    title: "Under the hood",
    body:
      "A public page — no sign-in needed — showing the pipeline trace, the code/model/human split, live token telemetry, and which evidence sources are real versus mocked.",
  },
];

const STEPS: { node: string; owner: "code" | "model" | "human"; what: string }[] = [
  { node: "intake", owner: "code", what: "Normalises the submission." },
  {
    node: "org_lookup",
    owner: "code",
    what: "Checks the organiser against a registry (verified / lapsed / revoked / absent).",
  },
  {
    node: "duplicate_check",
    owner: "code",
    what: "Compares text and image fingerprints against past campaigns.",
  },
  {
    node: "ask_and_media",
    owner: "code",
    what: "Ask vs. median ratio; image geo-tag and date vs. claimed location.",
  },
  { node: "web_search", owner: "code", what: "Searches for independent mentions of the organiser." },
  {
    node: "risk_synthesis",
    owner: "model",
    what: "Reads the evidence, flags contradictions and manipulation, writes the summary.",
  },
  {
    node: "human_handoff",
    owner: "human",
    what: "Approves, rejects, or escalates. Never delegated to code or model.",
  },
];

const SOURCES = [
  { label: "Organisation registry", value: "ProPublica Nonprofit Explorer — live, US only" },
  { label: "Web search", value: "Tavily on live submissions; canned results on the 14 fixtures" },
  { label: "Duplicate detection", value: "Text similarity is real; image matching uses seeded fingerprints" },
  { label: "Campaign dataset", value: "14 fixtures with known expected outcomes" },
];

export default function AppIntroModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6 py-10 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="intro-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-panel border-line flex max-h-full w-full max-w-[760px] flex-col overflow-hidden rounded-xl border shadow-2xl"
      >
        <div className="border-line flex items-start justify-between gap-4 border-b px-7 py-5">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="bg-brand inline-block h-2.5 w-2.5 rounded-sm" />
              <h1 id="intro-modal-title" className="text-[17px] font-semibold tracking-tight">
                Welcome to the Campaign Trust Copilot
              </h1>
            </div>
            <p className="text-muted text-[13px] leading-relaxed">
              A quick tour before you start reviewing: what this build has, and how a
              campaign gets screened.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-ink hover:bg-ground -mt-1 -mr-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[16px] transition-colors"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto px-7 py-6">
          <h2 className="text-muted mb-3 text-xs font-semibold tracking-[0.08em] uppercase">
            What this build has
          </h2>
          <div className="mb-7 grid grid-cols-3 gap-3">
            {HAVE.map((h) => (
              <div key={h.title} className="bg-ground border-line rounded-lg border px-3.5 py-3.5">
                <p className="text-ink mb-1.5 text-[12.5px] font-semibold">{h.title}</p>
                <p className="text-muted text-[12px] leading-relaxed">{h.body}</p>
              </div>
            ))}
          </div>

          <h2 className="text-muted mb-3 text-xs font-semibold tracking-[0.08em] uppercase">
            How campaign screening works
          </h2>
          <p className="text-muted mb-3 text-[12.5px] leading-relaxed">
            Every submission passes through seven steps. Five gather evidence with
            code, one uses a language model, one always stops for a human.
          </p>
          <ol className="bg-ground border-line mb-3 rounded-lg border">
            {STEPS.map((s, i) => (
              <li
                key={s.node}
                className="border-line flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0"
              >
                <span className="mono text-muted w-4 flex-shrink-0 text-[11px]">{i + 1}</span>
                <span className="mono w-[110px] flex-shrink-0 text-[12px] font-medium">
                  {s.node}
                </span>
                <span
                  className={`${OWNER_STYLE[s.owner]} w-[46px] flex-shrink-0 rounded-full px-2 py-0.5 text-center text-[10px] font-semibold tracking-wide uppercase`}
                >
                  {s.owner}
                </span>
                <span className="text-muted flex-1 text-[12.5px] leading-snug">{s.what}</span>
              </li>
            ))}
          </ol>
          <p className="text-muted mb-7 text-[12px] leading-relaxed">
            The model never sets the risk score — it is arithmetic from flags, so the
            same flags always produce the same score. Only a human can approve, reject,
            or escalate.
          </p>

          <h2 className="text-muted mb-3 text-xs font-semibold tracking-[0.08em] uppercase">
            Data sources checked
          </h2>
          <div className="bg-ground border-line mb-1 overflow-hidden rounded-lg border">
            {SOURCES.map((r) => (
              <div
                key={r.label}
                className="border-line flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0"
              >
                <span className="w-[170px] flex-shrink-0 text-[12.5px] font-medium">
                  {r.label}
                </span>
                <span className="text-muted flex-1 text-[12px]">{r.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border-line bg-panel flex items-center justify-between gap-4 border-t px-7 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/under-the-hood"
              onClick={onClose}
              className="text-brand-deep text-[13px] font-medium underline underline-offset-4"
            >
              See the full breakdown in Under the hood
            </Link>
            <span className="text-line text-[13px]">·</span>
            <Link
              href="/about"
              onClick={onClose}
              className="text-brand-deep text-[13px] font-medium underline underline-offset-4"
            >
              About me
            </Link>
          </div>
          <button
            onClick={onClose}
            className="bg-brand hover:bg-brand-deep flex-shrink-0 rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

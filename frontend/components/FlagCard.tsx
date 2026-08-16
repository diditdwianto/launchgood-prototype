"use client";

import { useState } from "react";

import { FLAG_LABELS, type Flag } from "@/lib/api";
import EvidenceGraph from "./EvidenceGraph";
import { OriginTag, SeverityBadge } from "./ui";

const BORDER: Record<Flag["severity"], string> = {
  low: "border-l-low",
  medium: "border-l-medium",
  high: "border-l-high",
};

export default function FlagCard({
  flag,
  onRequestInfo,
}: {
  flag: Flag;
  /** Present only on findings whose next_action invites it — see the review page. */
  onRequestInfo?: (flag: Flag) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <article
      className={`bg-panel border-line ${BORDER[flag.severity]} mb-3 rounded-r-lg border border-l-[3px] px-4 py-3.5`}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          {FLAG_LABELS[flag.type] ?? flag.type}
          {flag.contradiction ? (
            <span className="bg-high-tint text-high rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
              contradiction
            </span>
          ) : null}
        </h3>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <OriginTag origin={flag.origin} />
          <SeverityBadge severity={flag.severity} />
        </div>
      </div>

      <p className="text-[13.5px] leading-relaxed">{flag.evidence}</p>

      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="mono text-muted text-[10.5px]">source: {flag.source}</p>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-brand-deep text-[11.5px] underline underline-offset-4"
        >
          {open ? "Hide evidence chain" : "Show evidence chain"}
        </button>
      </div>

      {open ? <EvidenceGraph flag={flag} /> : null}

      {open && flag.next_action === "request_more_information" && onRequestInfo ? (
        <button
          onClick={() => onRequestInfo(flag)}
          className="bg-brand hover:bg-brand-deep mt-3 w-full rounded-lg py-2 text-[12.5px] font-semibold text-white transition-colors"
        >
          Draft a request for more information
        </button>
      ) : null}
    </article>
  );
}

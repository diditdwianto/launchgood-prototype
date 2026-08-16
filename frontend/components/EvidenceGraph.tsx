import type { Flag } from "@/lib/api";

const NEXT_ACTION_LABEL: Record<Flag["next_action"], string> = {
  none: "No action needed",
  verify_manually: "Verify manually",
  request_more_information: "Request more information",
  reject_recommended: "Rejection recommended",
};

const NEXT_ACTION_STYLE: Record<Flag["next_action"], string> = {
  none: "bg-panel text-muted border border-line",
  verify_manually: "bg-medium-tint text-medium",
  request_more_information: "bg-brand-tint text-brand-deep",
  reject_recommended: "bg-high-tint text-high",
};

const SOURCE_LABEL: Record<string, string> = {
  campaign_text: "campaign text",
  org_registry: "org registry",
  duplicate_check: "duplicate check",
  platform_stats: "platform stats",
  media_metadata: "media metadata",
  web_search: "web search",
};

/**
 * The evidence chain behind one flag: the claim examined, every source consulted,
 * and — when two sources disagree — the contradiction made visible as data rather
 * than prose. A flag with one source is a settled fact rendered the same way a
 * contradiction is: nothing here is ever just a conclusion.
 */
export default function EvidenceGraph({ flag }: { flag: Flag }) {
  return (
    <div className="border-line bg-ground/40 mt-3 rounded-lg border px-4 py-3.5">
      <Node label="Claim">
        <p className="text-[13px] leading-relaxed italic">&ldquo;{flag.claim}&rdquo;</p>
      </Node>

      <Connector />

      <Node label={flag.sources.length > 1 ? "Sources" : "Source"}>
        <div className="space-y-2">
          {flag.sources.map((s, i) => (
            <div
              key={i}
              className={`rounded-md border px-3 py-2 ${
                flag.contradiction
                  ? "border-high/40 bg-high-tint/40"
                  : "border-line bg-panel"
              }`}
            >
              <span className="mono text-muted mb-1 block text-[10.5px] tracking-wide uppercase">
                {SOURCE_LABEL[s.source] ?? s.source}
              </span>
              <p className="text-[12.5px] leading-snug">&ldquo;{s.quote}&rdquo;</p>
            </div>
          ))}
        </div>
      </Node>

      <Connector />

      {flag.contradiction ? (
        <>
          <div className="bg-high mb-3 rounded-md px-3 py-2 text-center text-[11.5px] font-semibold tracking-wide text-white uppercase">
            Contradiction detected
          </div>
          <Connector />
        </>
      ) : null}

      <Node label="Reasoning">
        <p className="text-[12.5px] leading-relaxed">{flag.reasoning}</p>
      </Node>

      <Node label="What remains uncertain">
        <p className="text-muted text-[12.5px] leading-relaxed">{flag.uncertainty}</p>
      </Node>

      <Connector />

      <div className="flex items-center justify-between gap-3">
        <span
          className={`${NEXT_ACTION_STYLE[flag.next_action]} rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase`}
        >
          {NEXT_ACTION_LABEL[flag.next_action]}
        </span>
        <span
          className="mono text-muted text-[11px]"
          title="Confidence in this finding specifically, not the campaign overall."
        >
          finding confidence <b className="text-ink">{flag.finding_confidence.toFixed(2)}</b>
        </span>
      </div>
    </div>
  );
}

function Node({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <span className="text-muted mb-1.5 block text-[10.5px] font-semibold tracking-[0.08em] uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

function Connector() {
  return (
    <div className="mb-3 flex justify-center">
      <div className="border-line h-3 border-l" />
    </div>
  );
}

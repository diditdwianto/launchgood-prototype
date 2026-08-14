import { FLAG_LABELS, type Flag } from "@/lib/api";
import { OriginTag, SeverityBadge } from "./ui";

const BORDER: Record<Flag["severity"], string> = {
  low: "border-l-low",
  medium: "border-l-medium",
  high: "border-l-high",
};

export default function FlagCard({ flag }: { flag: Flag }) {
  return (
    <article
      className={`bg-panel border-line ${BORDER[flag.severity]} mb-3 rounded-r-lg border border-l-[3px] px-4 py-3.5`}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">
          {FLAG_LABELS[flag.type] ?? flag.type}
        </h3>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <OriginTag origin={flag.origin} />
          <SeverityBadge severity={flag.severity} />
        </div>
      </div>

      <p className="text-[13.5px] leading-relaxed">{flag.evidence}</p>

      <p className="mono text-muted mt-2 text-[10.5px]">source: {flag.source}</p>
    </article>
  );
}

import type { RiskTier, Severity } from "@/lib/api";

const TIER_STYLES: Record<RiskTier, string> = {
  low: "bg-low-tint text-low",
  medium: "bg-medium-tint text-medium",
  high: "bg-high-tint text-high",
};

export function TierBadge({
  tier,
  children,
}: {
  tier: RiskTier;
  children?: React.ReactNode;
}) {
  return (
    <span
      className={`${TIER_STYLES[tier]} rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap`}
    >
      {children ?? `${tier} risk`}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={`${TIER_STYLES[severity]} rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide`}
    >
      {severity}
    </span>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-muted mb-3 text-xs font-semibold tracking-[0.08em] uppercase">
      {children}
    </h2>
  );
}

/** Distinguishes a fact produced by a lookup from a judgment produced by the model. */
export function OriginTag({ origin }: { origin: "deterministic" | "model" }) {
  const isRule = origin === "deterministic";
  return (
    <span
      title={
        isRule
          ? "Raised by a deterministic check: a registry lookup, a fingerprint match, or a ratio. Reproducible."
          : "Raised by the language model reading the evidence bundle. A judgment, not a lookup."
      }
      className={`mono rounded px-1.5 py-0.5 text-[10px] ${
        isRule
          ? "bg-brand-tint text-brand-deep"
          : "border-line text-muted border bg-white"
      }`}
    >
      {isRule ? "rule" : "model"}
    </span>
  );
}

export function Empty({
  title,
  hint,
}: {
  title: string;
  hint?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 py-24 text-center">
      <p className="text-ink text-sm font-medium">{title}</p>
      {hint ? <p className="text-muted mt-2 max-w-md text-sm">{hint}</p> : null}
    </div>
  );
}

import React from "react";
import { useCurrentFrame } from "remotion";
import { colors } from "../theme";
import { fontFamily } from "../font";

const MODELS = [
  { name: "gpt-oss-20b", provider: "groq" },
  { name: "gpt-oss-120b", provider: "groq" },
  { name: "gpt-oss-safeguard-20b", provider: "groq" },
  { name: "nemotron-3-super-120b", provider: "nvidia" },
] as const;

// The real fallback chain from model_chain: fast-first Groq models, then one
// durable NVIDIA model at the end. exhaustedIndices dims a model out (quota
// spent); activeIndex pulses the one currently answering.
export const ModelChain: React.FC<{
  exhaustedIndices?: number[];
  activeIndex?: number;
}> = ({ exhaustedIndices = [], activeIndex }) => {
  const frame = useCurrentFrame();
  const pulse = 1 + Math.sin(frame / 9) * 0.05;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {MODELS.map((m, i) => {
          const exhausted = exhaustedIndices.includes(i);
          const active = activeIndex === i;
          return (
            <React.Fragment key={m.name}>
              {i > 0 ? (
                <span style={{ fontFamily, fontSize: 22, color: colors.faint }}>
                  →
                </span>
              ) : null}
              <div
                style={{
                  scale: active ? pulse : 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    fontFamily,
                    fontSize: 20,
                    fontWeight: 700,
                    padding: "14px 20px",
                    borderRadius: 12,
                    color: exhausted ? colors.faint : colors.ink,
                    backgroundColor: active ? colors.brandTint : colors.panel,
                    border: `2px solid ${active ? colors.brand : colors.line}`,
                    textDecoration: exhausted ? "line-through" : "none",
                    opacity: exhausted ? 0.5 : 1,
                    boxShadow: active
                      ? `0 0 0 ${8 + Math.sin(frame / 9) * 3}px ${colors.brandTint}`
                      : "none",
                  }}
                >
                  {m.name}
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 14, fontFamily }}>
        <span
          style={{
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: colors.muted,
          }}
        >
          groq — fast, daily quota per model
        </span>
        <span style={{ color: colors.line }}>·</span>
        <span
          style={{
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: colors.muted,
          }}
        >
          nvidia — slower, limited per minute
        </span>
      </div>
    </div>
  );
};

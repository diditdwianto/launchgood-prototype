import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { colors } from "../theme";
import { fontFamily } from "../font";
import { Owner } from "./PillBadge";

// The seven real pipeline nodes from /under-the-hood, in their real order.
const NODES: { id: string; label: string; owner: Owner }[] = [
  { id: "intake", label: "intake", owner: "code" },
  { id: "org_lookup", label: "org_lookup", owner: "code" },
  { id: "duplicate_check", label: "duplicate_check", owner: "code" },
  { id: "ask_and_media", label: "ask_and_media", owner: "code" },
  { id: "web_search", label: "web_search", owner: "code" },
  { id: "risk_synthesis", label: "risk_synthesis", owner: "model" },
  { id: "human_handoff", label: "human_handoff", owner: "human" },
];

const OWNER_COLOR: Record<Owner, string> = {
  code: colors.brand,
  model: colors.model,
  human: colors.human,
};

const OWNER_TINT: Record<Owner, string> = {
  code: colors.brandTint,
  model: colors.modelTint,
  human: colors.humanTint,
};

/**
 * Builds up across three consecutive scenes (code steps, then model, then
 * human) rather than redrawing from scratch each time, so the diagram reads
 * as one continuous pipeline instead of three unrelated illustrations.
 */
export const PipelineDiagram: React.FC<{
  settledCount: number;
  revealStart: number;
  revealStep: number;
  revealCount: number;
  highlightIndex?: number;
}> = ({ settledCount, revealStart, revealStep, revealCount, highlightIndex }) => {
  const frame = useCurrentFrame();
  const nodeSize = 92;
  const gap = 228;
  const totalWidth = gap * (NODES.length - 1) + nodeSize;

  return (
    <div style={{ position: "relative", width: totalWidth, height: 210 }}>
      <div
        style={{
          position: "absolute",
          top: nodeSize / 2,
          left: nodeSize / 2,
          width: totalWidth - nodeSize,
          height: 2,
          backgroundColor: colors.line,
        }}
      />
      {NODES.map((node, i) => {
        let state: "hidden" | "settled" | "active" = "hidden";
        let entrance = 0;

        if (i < settledCount) {
          state = "settled";
          entrance = 1;
        } else if (i < settledCount + revealCount) {
          const localReveal = revealStart + (i - settledCount) * revealStep;
          if (frame >= localReveal) {
            state = "active";
            entrance = interpolate(frame, [localReveal, localReveal + 18], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            });
          }
        }

        const isHighlighted = state === "active" && highlightIndex === i;
        const pulse = isHighlighted
          ? 1 + Math.sin(frame / 9) * 0.045
          : 1;

        const ownerColor = OWNER_COLOR[node.owner];
        const ownerTint = OWNER_TINT[node.owner];

        return (
          <div
            key={node.id}
            style={{
              position: "absolute",
              left: i * gap,
              top: 0,
              width: nodeSize,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <div
              style={{
                width: nodeSize,
                height: nodeSize,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                scale: state === "hidden" ? 1 : 0.72 + entrance * 0.28 * pulse,
                opacity: state === "hidden" ? 0.22 : state === "settled" ? 0.55 : entrance,
                backgroundColor: state === "hidden" ? colors.panel : ownerTint,
                border: `2px solid ${state === "hidden" ? colors.line : ownerColor}`,
                boxShadow: isHighlighted
                  ? `0 0 0 ${10 + Math.sin(frame / 9) * 3}px ${ownerTint}`
                  : "none",
              }}
            >
              <span
                style={{
                  fontFamily,
                  fontWeight: 800,
                  fontSize: 30,
                  color: state === "hidden" ? colors.faint : ownerColor,
                }}
              >
                {i + 1}
              </span>
            </div>
            <div
              style={{
                marginTop: 18,
                opacity: state === "hidden" ? 0 : state === "settled" ? 0.6 : entrance,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontFamily,
                  fontSize: 21,
                  fontWeight: 600,
                  color: colors.ink,
                  whiteSpace: "nowrap",
                }}
              >
                {node.label}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

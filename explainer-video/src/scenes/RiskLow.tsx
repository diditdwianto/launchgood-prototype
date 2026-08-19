import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { SceneFade } from "../components/SceneFade";
import { Statement } from "../components/Statement";
import { Screenshot } from "../components/Screenshot";
import { Eyebrow } from "../components/Eyebrow";
import { colors } from "../theme";
import { fontFamily } from "../font";
import { scenes } from "../script";

const DURATION = scenes.find((s) => s.id === "riskLow")!.duration;

export const RiskLow: React.FC = () => {
  const frame = useCurrentFrame();
  const shotOpacity = interpolate(frame, [15, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const captionOpacity = interpolate(frame, [75, 105], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFade durationInFrames={DURATION}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 36 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Eyebrow>Low risk</Eyebrow>
          <span
            style={{
              fontFamily,
              fontSize: 30,
              fontWeight: 800,
              color: colors.brand,
            }}
          >
            score 0
          </span>
        </div>
        <div style={{ opacity: shotOpacity }}>
          <Screenshot src="screens/low-risk-clean.jpg" width={1150} aspectRatio={1298 / 345} />
        </div>
        <div style={{ opacity: captionOpacity }}>
          <Statement size={50}>
            Verified, consistent, no contradictions — a clean pass, reviewed in seconds.
          </Statement>
        </div>
      </div>
    </SceneFade>
  );
};

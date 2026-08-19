import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { SceneFade } from "../components/SceneFade";
import { Statement } from "../components/Statement";
import { Screenshot } from "../components/Screenshot";
import { Eyebrow } from "../components/Eyebrow";
import { colors } from "../theme";
import { fontFamily } from "../font";
import { scenes } from "../script";

const DURATION = scenes.find((s) => s.id === "riskHigh")!.duration;

export const RiskHigh: React.FC = () => {
  const frame = useCurrentFrame();
  const shotOpacity = interpolate(frame, [15, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const captionOpacity = interpolate(frame, [80, 110], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFade durationInFrames={DURATION}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 36 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Eyebrow>High risk</Eyebrow>
          <span
            style={{
              fontFamily,
              fontSize: 30,
              fontWeight: 800,
              color: colors.human,
            }}
          >
            score 100
          </span>
        </div>
        <div style={{ opacity: shotOpacity }}>
          <Screenshot src="screens/high-risk-flags.jpg" width={1100} aspectRatio={1242 / 400} />
        </div>
        <div style={{ opacity: captionOpacity }}>
          <Statement size={50}>
            A revoked registration. Reused images. An ask five times the median.
          </Statement>
        </div>
      </div>
    </SceneFade>
  );
};

import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { SceneFade } from "../components/SceneFade";
import { Statement, Emphasis } from "../components/Statement";
import { Screenshot } from "../components/Screenshot";
import { Eyebrow } from "../components/Eyebrow";
import { colors } from "../theme";
import { fontFamily } from "../font";
import { scenes } from "../script";

const DURATION = scenes.find((s) => s.id === "riskEscalated")!.duration;

export const RiskEscalated: React.FC = () => {
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
          <Eyebrow>Needs a human</Eyebrow>
          <span
            style={{
              fontFamily,
              fontSize: 30,
              fontWeight: 800,
              color: colors.model,
            }}
          >
            score 35
          </span>
        </div>
        <div style={{ opacity: shotOpacity }}>
          <Screenshot src="screens/escalated-full.jpg" width={1150} aspectRatio={1298 / 370} />
        </div>
        <div style={{ opacity: captionOpacity }}>
          <Statement size={50}>
            Verified organiser, corroborating evidence — but an ask this size, from a
            first-time group, is a call for a person, not a formula.{" "}
            <Emphasis color={colors.model}>Escalated, not guessed.</Emphasis>
          </Statement>
        </div>
      </div>
    </SceneFade>
  );
};

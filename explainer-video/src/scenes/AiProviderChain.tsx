import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { SceneFade } from "../components/SceneFade";
import { Statement, Emphasis } from "../components/Statement";
import { ModelChain } from "../components/ModelChain";
import { Eyebrow } from "../components/Eyebrow";

export const AiProviderChain: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const chainOpacity = interpolate(frame, [15, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const captionOpacity = interpolate(frame, [90, 120], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const activeIndex = Math.floor(frame / 25) % 3;

  return (
    <SceneFade durationInFrames={durationInFrames}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 46 }}>
        <Eyebrow>Under the hood — the model</Eyebrow>
        <div style={{ opacity: chainOpacity }}>
          <ModelChain activeIndex={activeIndex} />
        </div>
        <div style={{ opacity: captionOpacity }}>
          <Statement size={52}>
            <Emphasis>risk_synthesis</Emphasis> calls Groq first — three models, fastest
            first, answering in 1.5 to 3 seconds.
          </Statement>
        </div>
      </div>
    </SceneFade>
  );
};

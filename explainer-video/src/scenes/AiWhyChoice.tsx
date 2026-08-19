import React from "react";
import { SceneFade } from "../components/SceneFade";
import { Statement, Emphasis } from "../components/Statement";
import { Eyebrow } from "../components/Eyebrow";

export const AiWhyChoice: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => (
  <SceneFade durationInFrames={durationInFrames}>
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 40 }}>
      <Eyebrow>Why Groq and NVIDIA</Eyebrow>
      <Statement size={62}>
        Their free tiers were a <Emphasis>deliberate choice</Emphasis> — limits tight
        enough to actually get hit, so the fallback isn&apos;t just a claim in a
        README.
      </Statement>
    </div>
  </SceneFade>
);

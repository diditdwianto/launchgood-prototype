import React from "react";
import { SceneFade } from "../components/SceneFade";
import { Statement } from "../components/Statement";
import { Eyebrow } from "../components/Eyebrow";

export const FutureIntro: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => (
  <SceneFade durationInFrames={durationInFrames}>
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 40 }}>
      <Eyebrow>What&apos;s next</Eyebrow>
      <Statement size={64}>
        Two things aren&apos;t built yet — but the path to both is already clear.
      </Statement>
    </div>
  </SceneFade>
);

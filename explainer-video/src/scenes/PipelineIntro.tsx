import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { SceneFade } from "../components/SceneFade";
import { Statement } from "../components/Statement";
import { PipelineDiagram } from "../components/PipelineDiagram";

export const PipelineIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const diagramOpacity = interpolate(frame, [30, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFade durationInFrames={120}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 70 }}>
        <Statement size={72}>Every submission moves through seven steps.</Statement>
        <div style={{ opacity: diagramOpacity }}>
          <PipelineDiagram settledCount={0} revealStart={9999} revealStep={0} revealCount={0} />
        </div>
      </div>
    </SceneFade>
  );
};

import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { SceneFade } from "../components/SceneFade";
import { Statement, Emphasis } from "../components/Statement";
import { PipelineDiagram } from "../components/PipelineDiagram";
import { colors } from "../theme";

export const PipelineModel: React.FC = () => {
  const frame = useCurrentFrame();
  const captionOpacity = interpolate(frame, [55, 85], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFade durationInFrames={180}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 64 }}>
        <PipelineDiagram
          settledCount={5}
          revealStart={20}
          revealStep={0}
          revealCount={1}
          highlightIndex={5}
        />
        <div style={{ opacity: captionOpacity }}>
          <Statement size={60}>
            One step reads that evidence with a{" "}
            <Emphasis color={colors.model}>language model</Emphasis> — for judgment code
            can&apos;t encode.
          </Statement>
        </div>
      </div>
    </SceneFade>
  );
};

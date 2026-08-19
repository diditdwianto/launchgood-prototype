import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { SceneFade } from "../components/SceneFade";
import { Statement, Emphasis } from "../components/Statement";
import { PipelineDiagram } from "../components/PipelineDiagram";
import { colors } from "../theme";

export const PipelineHuman: React.FC = () => {
  const frame = useCurrentFrame();
  const captionOpacity = interpolate(frame, [55, 85], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFade durationInFrames={180}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 64 }}>
        <PipelineDiagram
          settledCount={6}
          revealStart={20}
          revealStep={0}
          revealCount={1}
          highlightIndex={6}
        />
        <div style={{ opacity: captionOpacity }}>
          <Statement size={60}>
            The last step is always a <Emphasis color={colors.human}>human.</Emphasis>{" "}
            Approve, reject, or escalate — never delegated.
          </Statement>
        </div>
      </div>
    </SceneFade>
  );
};

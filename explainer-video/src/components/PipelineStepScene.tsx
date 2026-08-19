import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { SceneFade } from "./SceneFade";
import { PipelineDiagram } from "./PipelineDiagram";

// Shared layout for every "walk through one pipeline node" scene: the
// building diagram on top, a caption revealed just after, underneath.
export const PipelineStepScene: React.FC<{
  durationInFrames: number;
  settledCount: number;
  revealStart: number;
  revealCount: number;
  highlightIndex: number;
  captionAt?: number;
  children: React.ReactNode;
}> = ({
  durationInFrames,
  settledCount,
  revealStart,
  revealCount,
  highlightIndex,
  captionAt = 55,
  children,
}) => {
  const frame = useCurrentFrame();
  const captionOpacity = interpolate(frame, [captionAt, captionAt + 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFade durationInFrames={durationInFrames}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 60 }}>
        <PipelineDiagram
          settledCount={settledCount}
          revealStart={revealStart}
          revealStep={0}
          revealCount={revealCount}
          highlightIndex={highlightIndex}
        />
        <div style={{ opacity: captionOpacity }}>{children}</div>
      </div>
    </SceneFade>
  );
};

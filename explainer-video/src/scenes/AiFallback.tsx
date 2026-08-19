import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { SceneFade } from "../components/SceneFade";
import { Statement, Emphasis } from "../components/Statement";
import { ModelChain } from "../components/ModelChain";
import { Eyebrow } from "../components/Eyebrow";

export const AiFallback: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const chainOpacity = interpolate(frame, [15, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exhaustedOpacity = interpolate(frame, [50, 75], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const captionOpacity = interpolate(frame, [110, 140], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFade durationInFrames={durationInFrames}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 46 }}>
        <Eyebrow>What happens when a quota runs out</Eyebrow>
        <div style={{ opacity: chainOpacity }}>
          <ModelChain
            exhaustedIndices={exhaustedOpacity > 0.5 ? [0, 1, 2] : []}
            activeIndex={exhaustedOpacity > 0.5 ? 3 : undefined}
          />
        </div>
        <div style={{ opacity: captionOpacity }}>
          <Statement size={52}>
            Each Groq model has its own daily quota. When one runs out, the next takes
            over — and the last model, limited per minute instead of per day,{" "}
            <Emphasis>never does.</Emphasis>
          </Statement>
        </div>
      </div>
    </SceneFade>
  );
};

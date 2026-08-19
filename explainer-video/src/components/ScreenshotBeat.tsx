import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { SceneFade } from "./SceneFade";
import { Screenshot } from "./Screenshot";
import { Eyebrow } from "./Eyebrow";

// Shared layout for every "here's a real screenshot" beat: eyebrow, the
// screenshot, then a caption revealed just after. Used for the model
// examples and the submit/run-assessment screen tour.
export const ScreenshotBeat: React.FC<{
  durationInFrames: number;
  eyebrow: string;
  src: string;
  width: number;
  aspectRatio: number;
  chrome?: boolean;
  captionAt?: number;
  children: React.ReactNode;
}> = ({
  durationInFrames,
  eyebrow,
  src,
  width,
  aspectRatio,
  chrome = false,
  captionAt = 75,
  children,
}) => {
  const frame = useCurrentFrame();
  const shotOpacity = interpolate(frame, [15, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const captionOpacity = interpolate(frame, [captionAt, captionAt + 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFade durationInFrames={durationInFrames}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 38 }}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <div style={{ opacity: shotOpacity }}>
          <Screenshot src={src} width={width} aspectRatio={aspectRatio} chrome={chrome} />
        </div>
        <div style={{ opacity: captionOpacity }}>{children}</div>
      </div>
    </SceneFade>
  );
};

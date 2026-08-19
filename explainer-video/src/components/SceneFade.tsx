import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Background } from "./Background";

// Every scene fades and lifts in, holds, then fades out — the one motion
// pattern used throughout, so cuts read as a steady heartbeat rather than
// a different trick every time.
export const SceneFade: React.FC<{
  durationInFrames: number;
  children: React.ReactNode;
}> = ({ durationInFrames, children }) => {
  const frame = useCurrentFrame();
  const fadeIn = 20;
  const fadeOut = 20;

  const opacity = interpolate(
    frame,
    [0, fadeIn, durationInFrames - fadeOut, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const lift = interpolate(frame, [0, fadeIn], [22, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <AbsoluteFill>
      <Background />
      <AbsoluteFill
        style={{
          opacity,
          translate: `0px ${lift}px`,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

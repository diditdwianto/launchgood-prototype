import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { SceneFade } from "../components/SceneFade";
import { Eyebrow } from "../components/Eyebrow";
import { Logo } from "../components/Logo";
import { scenes } from "../script";
import { fontFamily } from "../font";

const DURATION = scenes.find((s) => s.id === "title")!.duration;

export const Title: React.FC = () => {
  const frame = useCurrentFrame();

  const eyebrowOpacity = interpolate(frame, [10, 32], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const logoProgress = interpolate(frame, [30, 62], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const subOpacity = interpolate(frame, [58, 82], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFade durationInFrames={DURATION}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 34,
        }}
      >
        <div style={{ opacity: eyebrowOpacity }}>
          <Eyebrow>Trust &amp; Safety Copilot</Eyebrow>
        </div>
        <div
          style={{
            opacity: logoProgress,
            scale: 0.9 + logoProgress * 0.1,
          }}
        >
          <Logo size={56} />
        </div>
        <div style={{ opacity: subOpacity }}>
          <span
            style={{
              fontFamily,
              fontSize: 32,
              fontWeight: 500,
              color: "#525252",
            }}
          >
            for crowdfunding platforms like LaunchGood
          </span>
        </div>
      </div>
    </SceneFade>
  );
};

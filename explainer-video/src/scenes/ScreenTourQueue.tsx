import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { SceneFade } from "../components/SceneFade";
import { Statement } from "../components/Statement";
import { Screenshot } from "../components/Screenshot";
import { scenes } from "../script";

const DURATION = scenes.find((s) => s.id === "screenTourQueue")!.duration;

export const ScreenTourQueue: React.FC = () => {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, DURATION], [1, 1.05]);
  const captionOpacity = interpolate(frame, [20, 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFade durationInFrames={DURATION}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 40 }}>
        <div style={{ scale: zoom, transformOrigin: "10% 30%" }}>
          <Screenshot src="screens/queue-full.jpg" width={1300} aspectRatio={1568 / 735} chrome />
        </div>
        <div style={{ opacity: captionOpacity }}>
          <Statement size={52}>The queue, ordered by risk score — highest first.</Statement>
        </div>
      </div>
    </SceneFade>
  );
};

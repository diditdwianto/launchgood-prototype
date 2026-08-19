import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { SceneFade } from "../components/SceneFade";
import { Statement } from "../components/Statement";
import { Screenshot } from "../components/Screenshot";
import { Eyebrow } from "../components/Eyebrow";
import { scenes } from "../script";

const DURATION = scenes.find((s) => s.id === "screenTourLogin")!.duration;

export const ScreenTourLogin: React.FC = () => {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, DURATION], [1, 1.035]);
  const captionOpacity = interpolate(frame, [20, 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFade durationInFrames={DURATION}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 40 }}>
        <Eyebrow>See it in action</Eyebrow>
        <div style={{ opacity: captionOpacity }}>
          <Statement size={52}>One reviewer account. No self-registration.</Statement>
        </div>
        <div style={{ scale: zoom, transformOrigin: "center 30%" }}>
          <Screenshot src="screens/login.jpg" width={1150} aspectRatio={1568 / 735} chrome />
        </div>
      </div>
    </SceneFade>
  );
};

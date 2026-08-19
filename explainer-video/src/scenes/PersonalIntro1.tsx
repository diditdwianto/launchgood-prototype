import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { SceneFade } from "../components/SceneFade";
import { Statement } from "../components/Statement";
import { colors } from "../theme";
import { fontFamily } from "../font";

export const PersonalIntro1: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const avatarOpacity = interpolate(frame, [10, 35], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const textOpacity = interpolate(frame, [35, 65], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFade durationInFrames={durationInFrames}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 36 }}>
        <div
          style={{
            opacity: avatarOpacity,
            width: 92,
            height: 92,
            borderRadius: 999,
            backgroundColor: colors.brandTint,
            color: colors.brandDeep,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily,
            fontSize: 32,
            fontWeight: 700,
          }}
        >
          DD
        </div>
        <div style={{ opacity: textOpacity }}>
          <Statement size={68}>Hi, I&apos;m Didit. I live in Indonesia.</Statement>
        </div>
      </div>
    </SceneFade>
  );
};

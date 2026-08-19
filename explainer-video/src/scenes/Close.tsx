import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { SceneFade } from "../components/SceneFade";
import { Logo } from "../components/Logo";
import { colors } from "../theme";
import { fontFamily } from "../font";

export const Close: React.FC = () => {
  const frame = useCurrentFrame();
  const logoOpacity = interpolate(frame, [10, 34], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const tagOpacity = interpolate(frame, [40, 68], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFade durationInFrames={180}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 46 }}>
        <div style={{ opacity: logoOpacity }}>
          <Logo size={52} />
        </div>
        <div
          style={{
            opacity: tagOpacity,
            fontFamily,
            fontSize: 40,
            fontWeight: 600,
            textAlign: "center",
            lineHeight: 1.55,
            maxWidth: 1300,
            textWrap: "balance",
          }}
        >
          <span style={{ color: colors.brandDeep }}>Code decides what it can prove.</span>
          <br />
          <span style={{ color: colors.model }}>A model judges what it can&apos;t.</span>
          <br />
          <span style={{ color: colors.human }}>A human decides what matters.</span>
        </div>
      </div>
    </SceneFade>
  );
};

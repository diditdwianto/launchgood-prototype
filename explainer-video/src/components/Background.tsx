import React from "react";
import { AbsoluteFill } from "remotion";
import { colors } from "../theme";

// A quiet ground plus one soft, off-center glow — the restraint LaunchGood's
// own pages use (a single accent, not a gradient hero).
export const Background: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: colors.ground }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 900px 700px at 82% 12%, ${colors.brandTint} 0%, transparent 65%)`,
        }}
      />
    </AbsoluteFill>
  );
};

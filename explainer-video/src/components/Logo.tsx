import React from "react";
import { colors } from "../theme";
import { fontFamily } from "../font";

// The exact mark used in the app header and the About page: a brand-green
// rounded square dot plus the wordmark, same proportions, scaled up.
export const Logo: React.FC<{ size?: number; color?: string }> = ({
  size = 40,
  color = colors.ink,
}) => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: size * 0.42,
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.22,
          backgroundColor: colors.brand,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontFamily,
          fontWeight: 700,
          fontSize: size * 1.55,
          letterSpacing: "-0.01em",
          color,
        }}
      >
        Campaign Trust Copilot
      </span>
    </div>
  );
};

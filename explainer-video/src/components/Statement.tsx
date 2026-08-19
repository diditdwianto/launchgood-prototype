import React from "react";
import { colors } from "../theme";
import { fontFamily } from "../font";

// The default scene: one big message, centered, short lines. Used for every
// beat that is pure text — the problem, the principles, the close.
export const Statement: React.FC<{
  children: React.ReactNode;
  size?: number;
  color?: string;
  maxWidth?: number;
  weight?: number;
}> = ({
  children,
  size = 76,
  color = colors.ink,
  maxWidth = 1440,
  weight = 700,
}) => {
  return (
    <div
      style={{
        fontFamily,
        fontSize: size,
        fontWeight: weight,
        lineHeight: 1.32,
        letterSpacing: "-0.015em",
        color,
        textAlign: "center",
        maxWidth,
        textWrap: "balance",
      }}
    >
      {children}
    </div>
  );
};

export const Emphasis: React.FC<{
  children: React.ReactNode;
  color?: string;
}> = ({ children, color = colors.brandDeep }) => (
  <span style={{ color }}>{children}</span>
);

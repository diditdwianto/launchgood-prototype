import React from "react";
import { colors } from "../theme";
import { fontFamily } from "../font";

export const Eyebrow: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return (
    <div
      style={{
        fontFamily,
        fontSize: 30,
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: colors.brandDeep,
      }}
    >
      {children}
    </div>
  );
};

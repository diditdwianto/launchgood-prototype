import React from "react";
import { Img, staticFile } from "remotion";
import { colors } from "../theme";

// A real screen capture of the deployed console, framed as a product shot —
// not a mockup. Every image in public/screens/ is an actual screenshot.
export const Screenshot: React.FC<{
  src: string;
  width: number;
  aspectRatio: number;
  chrome?: boolean;
}> = ({ src, width, aspectRatio, chrome = false }) => {
  return (
    <div
      style={{
        width,
        borderRadius: 16,
        overflow: "hidden",
        backgroundColor: colors.panel,
        border: `1px solid ${colors.line}`,
        boxShadow: "0 2px 8px rgba(23,23,23,0.06), 0 24px 64px rgba(23,23,23,0.14)",
      }}
    >
      {chrome ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "14px 18px",
            borderBottom: `1px solid ${colors.line}`,
          }}
        >
          {[colors.human, colors.model, colors.brand].map((c) => (
            <span
              key={c}
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                backgroundColor: c,
                opacity: 0.55,
              }}
            />
          ))}
        </div>
      ) : null}
      <Img
        src={staticFile(src)}
        style={{ display: "block", width: "100%", height: width / aspectRatio }}
      />
    </div>
  );
};

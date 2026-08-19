import React from "react";
import { AbsoluteFill } from "remotion";
import { Background } from "./components/Background";
import { colors } from "./theme";
import { fontFamily } from "./font";

// A standalone thumbnail — not a frame from the video. Distills the video's
// own closing line (code / model / human) into something legible at
// thumbnail size: one focal idea per line, color-coded by the same
// code/model/human system the whole video and app use.
export const Thumbnail: React.FC = () => {
  return (
    <AbsoluteFill style={{ fontFamily }}>
      <Background />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 56 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 14,
                backgroundColor: colors.brand,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 46,
                fontWeight: 700,
                letterSpacing: "-0.01em",
                color: colors.ink,
              }}
            >
              Campaign Trust Copilot
            </span>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              textAlign: "center",
            }}
          >
            <span style={{ fontSize: 116, fontWeight: 800, lineHeight: 1.08, color: colors.brand }}>
              Code proves.
            </span>
            <span style={{ fontSize: 116, fontWeight: 800, lineHeight: 1.08, color: colors.model }}>
              Models judge.
            </span>
            <span style={{ fontSize: 116, fontWeight: 800, lineHeight: 1.08, color: colors.human }}>
              Humans decide.
            </span>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

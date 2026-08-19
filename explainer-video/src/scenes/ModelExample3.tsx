import React from "react";
import { ScreenshotBeat } from "../components/ScreenshotBeat";
import { Statement, Emphasis } from "../components/Statement";
import { colors } from "../theme";

export const ModelExample3: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => (
  <ScreenshotBeat
    durationInFrames={durationInFrames}
    eyebrow="A real example · 3 of 3"
    src="screens/timeline-example.jpg"
    width={1200}
    aspectRatio={1298 / 92}
  >
    <Statement size={52}>
      The campaign claims two years of activity —{" "}
      <Emphasis color={colors.model}>after its registration had already lapsed.</Emphasis>
    </Statement>
  </ScreenshotBeat>
);

import React from "react";
import { ScreenshotBeat } from "../components/ScreenshotBeat";
import { Statement, Emphasis } from "../components/Statement";
import { colors } from "../theme";

export const ModelExample1: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => (
  <ScreenshotBeat
    durationInFrames={durationInFrames}
    eyebrow="A real example · 1 of 3"
    src="screens/model-example.jpg"
    width={1200}
    aspectRatio={1298 / 130}
  >
    <Statement size={52}>
      Photos claimed &ldquo;from this week&rdquo; — but their metadata says{" "}
      <Emphasis color={colors.model}>over a year earlier, in a different country.</Emphasis>
    </Statement>
  </ScreenshotBeat>
);

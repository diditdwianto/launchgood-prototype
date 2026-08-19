import React from "react";
import { ScreenshotBeat } from "../components/ScreenshotBeat";
import { Statement, Emphasis } from "../components/Statement";

export const ScreenTourPipelineLive: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => (
  <ScreenshotBeat
    durationInFrames={durationInFrames}
    eyebrow="Run assessment"
    src="screens/submit-pipeline-live.jpg"
    width={1250}
    aspectRatio={1298 / 270}
  >
    <Statement size={52}>
      Every step here is live —{" "}
      <Emphasis>including an 18-second web search and a real model call.</Emphasis>
    </Statement>
  </ScreenshotBeat>
);

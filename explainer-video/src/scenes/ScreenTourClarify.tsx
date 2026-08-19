import React from "react";
import { ScreenshotBeat } from "../components/ScreenshotBeat";
import { Statement, Emphasis } from "../components/Statement";

export const ScreenTourClarify: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => (
  <ScreenshotBeat
    durationInFrames={durationInFrames}
    eyebrow="Request more information"
    src="screens/clarify-drafted.jpg"
    width={1150}
    aspectRatio={1298 / 265}
  >
    <Statement size={50}>
      A reviewer can ask the organiser for specific evidence — drafted by the model,{" "}
      <Emphasis>edited and sent only by a human.</Emphasis>
    </Statement>
  </ScreenshotBeat>
);

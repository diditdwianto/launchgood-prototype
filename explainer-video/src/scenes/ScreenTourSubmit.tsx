import React from "react";
import { ScreenshotBeat } from "../components/ScreenshotBeat";
import { Statement } from "../components/Statement";

export const ScreenTourSubmit: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => (
  <ScreenshotBeat
    durationInFrames={durationInFrames}
    eyebrow="Submit a campaign"
    src="screens/submit-form.jpg"
    width={1150}
    aspectRatio={1298 / 590}
    chrome
  >
    <Statement size={52}>
      Anyone can submit a campaign, and run the real pipeline against it.
    </Statement>
  </ScreenshotBeat>
);

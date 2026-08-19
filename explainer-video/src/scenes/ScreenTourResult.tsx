import React from "react";
import { ScreenshotBeat } from "../components/ScreenshotBeat";
import { Statement, Emphasis } from "../components/Statement";

export const ScreenTourResult: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => (
  <ScreenshotBeat
    durationInFrames={durationInFrames}
    eyebrow="Not staged — this ran live, while recording"
    src="screens/submit-result.jpg"
    width={1150}
    aspectRatio={1298 / 610}
    captionAt={95}
  >
    <Statement size={50}>
      The model caught something on its own: an organiser name matching a real
      nonprofit,{" "}
      <Emphasis>with no proof the account was authorised to use it.</Emphasis>
    </Statement>
  </ScreenshotBeat>
);

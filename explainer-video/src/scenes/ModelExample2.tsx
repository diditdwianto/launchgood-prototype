import React from "react";
import { ScreenshotBeat } from "../components/ScreenshotBeat";
import { Statement, Emphasis } from "../components/Statement";
import { colors } from "../theme";

export const ModelExample2: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => (
  <ScreenshotBeat
    durationInFrames={durationInFrames}
    eyebrow="A real example · 2 of 3"
    src="screens/impersonation-example.jpg"
    width={1200}
    aspectRatio={1298 / 100}
  >
    <Statement size={52}>
      Same name, unofficial account —{" "}
      <Emphasis color={colors.model}>
        users report wire-transfer requests from an entity with no registration anywhere.
      </Emphasis>
    </Statement>
  </ScreenshotBeat>
);

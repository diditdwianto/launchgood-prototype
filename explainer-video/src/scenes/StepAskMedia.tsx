import React from "react";
import { PipelineStepScene } from "../components/PipelineStepScene";
import { Statement, Emphasis } from "../components/Statement";
import { scenes } from "../script";

const DURATION = scenes.find((s) => s.id === "stepAskMedia")!.duration;

export const StepAskMedia: React.FC = () => (
  <PipelineStepScene
    durationInFrames={DURATION}
    settledCount={3}
    revealStart={20}
    revealCount={1}
    highlightIndex={3}
    captionAt={50}
  >
    <Statement size={54}>
      <Emphasis>ask_and_media</Emphasis> compares the ask to the median first-time
      request, and checks image metadata against the claimed time and place.
    </Statement>
  </PipelineStepScene>
);

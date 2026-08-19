import React from "react";
import { PipelineStepScene } from "../components/PipelineStepScene";
import { Statement, Emphasis } from "../components/Statement";
import { scenes } from "../script";

const DURATION = scenes.find((s) => s.id === "stepIntake")!.duration;

export const StepIntake: React.FC = () => (
  <PipelineStepScene
    durationInFrames={DURATION}
    settledCount={0}
    revealStart={20}
    revealCount={1}
    highlightIndex={0}
    captionAt={50}
  >
    <Statement size={54}>
      <Emphasis>intake</Emphasis> normalises the submission, and rejects anything missing
      a required field.
    </Statement>
  </PipelineStepScene>
);

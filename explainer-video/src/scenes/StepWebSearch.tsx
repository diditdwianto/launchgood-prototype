import React from "react";
import { PipelineStepScene } from "../components/PipelineStepScene";
import { Statement, Emphasis } from "../components/Statement";
import { scenes } from "../script";

const DURATION = scenes.find((s) => s.id === "stepWebSearch")!.duration;

export const StepWebSearch: React.FC = () => (
  <PipelineStepScene
    durationInFrames={DURATION}
    settledCount={4}
    revealStart={20}
    revealCount={1}
    highlightIndex={4}
    captionAt={50}
  >
    <Statement size={54}>
      <Emphasis>web_search</Emphasis> looks for independent mentions of the organiser
      online — live, for real submissions.
    </Statement>
  </PipelineStepScene>
);

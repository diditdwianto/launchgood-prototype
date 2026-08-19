import React from "react";
import { PipelineStepScene } from "../components/PipelineStepScene";
import { Statement, Emphasis } from "../components/Statement";
import { scenes } from "../script";

const DURATION = scenes.find((s) => s.id === "stepDuplicateCheck")!.duration;

export const StepDuplicateCheck: React.FC = () => (
  <PipelineStepScene
    durationInFrames={DURATION}
    settledCount={2}
    revealStart={20}
    revealCount={1}
    highlightIndex={2}
    captionAt={50}
  >
    <Statement size={54}>
      <Emphasis>duplicate_check</Emphasis> compares this campaign&apos;s text and images
      against every past submission. A match against one that was already{" "}
      rejected outranks everything else.
    </Statement>
  </PipelineStepScene>
);

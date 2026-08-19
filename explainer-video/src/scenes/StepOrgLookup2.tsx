import React from "react";
import { PipelineStepScene } from "../components/PipelineStepScene";
import { Statement, Emphasis } from "../components/Statement";
import { scenes } from "../script";

const DURATION = scenes.find((s) => s.id === "stepOrgLookup2")!.duration;

export const StepOrgLookup2: React.FC = () => (
  <PipelineStepScene
    durationInFrames={DURATION}
    settledCount={1}
    revealStart={0}
    revealCount={1}
    highlightIndex={1}
    captionAt={20}
  >
    <Statement size={54}>
      For most of the world — Indonesia, Pakistan, Nigeria — no such registry exists at
      any price. <Emphasis>Absence isn&apos;t treated as guilt.</Emphasis>
    </Statement>
  </PipelineStepScene>
);

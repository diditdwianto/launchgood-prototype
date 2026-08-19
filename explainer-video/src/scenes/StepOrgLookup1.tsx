import React from "react";
import { PipelineStepScene } from "../components/PipelineStepScene";
import { Statement, Emphasis } from "../components/Statement";
import { scenes } from "../script";

const DURATION = scenes.find((s) => s.id === "stepOrgLookup1")!.duration;

export const StepOrgLookup1: React.FC = () => (
  <PipelineStepScene
    durationInFrames={DURATION}
    settledCount={1}
    revealStart={20}
    revealCount={1}
    highlightIndex={1}
    captionAt={50}
  >
    <Statement size={54}>
      <Emphasis>org_lookup</Emphasis> checks the organiser against a registry — verified,
      lapsed, revoked, or absent. For a US charity, that&apos;s a live query against{" "}
      ProPublica&apos;s Nonprofit Explorer, built from IRS filings.
    </Statement>
  </PipelineStepScene>
);

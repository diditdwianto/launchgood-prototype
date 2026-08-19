import React from "react";
import { SceneFade } from "../components/SceneFade";
import { Statement, Emphasis } from "../components/Statement";

export const FutureAutomation: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => (
  <SceneFade durationInFrames={durationInFrames}>
    <Statement>
      And when an organiser replies with more evidence — a job for{" "}
      <Emphasis>an agentic step,</Emphasis> not a human refreshing a page: re-run the
      pipeline automatically, and tell the reviewer whether the reply actually
      resolves the concern.
    </Statement>
  </SceneFade>
);

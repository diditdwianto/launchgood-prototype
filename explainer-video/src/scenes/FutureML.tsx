import React from "react";
import { SceneFade } from "../components/SceneFade";
import { Statement, Emphasis } from "../components/Statement";

export const FutureML: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => (
  <SceneFade durationInFrames={durationInFrames}>
    <Statement>
      Replace the hand-picked severity weights —{" "}
      <Emphasis>high=35, medium=15, low=5</Emphasis> — with a model trained on the
      decision log itself, once there are enough labels to trust it.
    </Statement>
  </SceneFade>
);

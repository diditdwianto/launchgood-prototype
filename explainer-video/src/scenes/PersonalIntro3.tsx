import React from "react";
import { SceneFade } from "../components/SceneFade";
import { Statement, Emphasis } from "../components/Statement";

export const PersonalIntro3: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => (
  <SceneFade durationInFrames={durationInFrames}>
    <Statement>
      This project exists to give reviewers more evidence, faster —{" "}
      <Emphasis>so a deeper look is easy, not exceptional.</Emphasis>
    </Statement>
  </SceneFade>
);

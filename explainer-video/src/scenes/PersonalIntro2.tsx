import React from "react";
import { SceneFade } from "../components/SceneFade";
import { Statement, Emphasis } from "../components/Statement";
import { colors } from "../theme";

export const PersonalIntro2: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => (
  <SceneFade durationInFrames={durationInFrames}>
    <Statement>
      I&apos;ve seen campaigns slip past a platform&apos;s own careful vetting —{" "}
      <Emphasis color={colors.human}>and turn out to be fraud.</Emphasis>
    </Statement>
  </SceneFade>
);

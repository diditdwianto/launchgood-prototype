import React from "react";
import { SceneFade } from "../components/SceneFade";
import { Statement, Emphasis } from "../components/Statement";
import { colors } from "../theme";

export const PersonalIntro1b: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => (
  <SceneFade durationInFrames={durationInFrames}>
    <Statement size={58}>
      I use <Emphasis color={colors.kitabisa}>Kitabisa.com</Emphasis> a lot — for zakat,
      and regular sedekah — so I understand its strengths,{" "}
      <Emphasis color={colors.human}>and its weaknesses.</Emphasis>
    </Statement>
  </SceneFade>
);

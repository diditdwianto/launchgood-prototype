import React from "react";
import { SceneFade } from "../components/SceneFade";
import { Statement, Emphasis } from "../components/Statement";

export const FutureMLData: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => (
  <SceneFade durationInFrames={durationInFrames}>
    <Statement>
      That&apos;s roughly <Emphasis>2,000 labelled decisions</Emphasis> — with at least{" "}
      <Emphasis>200 rejections</Emphasis>, the rarer outcome. At today&apos;s volume,
      that&apos;s about a year of collecting.
    </Statement>
  </SceneFade>
);

import { Composition } from "remotion";
import { Explainer } from "./Explainer";
import { totalDuration } from "./script";
import { layout } from "./theme";

export const MyComposition = () => {
  return (
    <Composition
      id="Explainer"
      component={Explainer}
      durationInFrames={totalDuration}
      fps={layout.fps}
      width={layout.width}
      height={layout.height}
    />
  );
};

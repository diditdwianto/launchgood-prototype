import { Still } from "remotion";
import "./index.css";
import { MyComposition } from "./Composition";
import { Thumbnail } from "./Thumbnail";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <MyComposition />
      <Still id="Thumbnail" component={Thumbnail} width={1920} height={1080} />
    </>
  );
};

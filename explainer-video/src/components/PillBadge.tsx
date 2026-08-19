import React from "react";
import { colors } from "../theme";
import { fontFamily } from "../font";

export type Owner = "code" | "model" | "human";

const OWNER_STYLE: Record<Owner, { bg: string; fg: string }> = {
  code: { bg: colors.brandTint, fg: colors.brandDeep },
  model: { bg: colors.modelTint, fg: colors.model },
  human: { bg: colors.humanTint, fg: colors.human },
};

// The same code / model / human tag used on the app's Under the hood page —
// reused here rather than invented fresh, so the video and the product speak
// the same visual language.
export const PillBadge: React.FC<{ owner: Owner; size?: number }> = ({
  owner,
  size = 20,
}) => {
  const style = OWNER_STYLE[owner];
  return (
    <span
      style={{
        fontFamily,
        display: "inline-block",
        backgroundColor: style.bg,
        color: style.fg,
        borderRadius: 999,
        padding: `${size * 0.28}px ${size * 0.7}px`,
        fontSize: size,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}
    >
      {owner}
    </span>
  );
};

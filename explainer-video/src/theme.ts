// Design tokens pulled from launchgood.com's live computed styles (bg-primary,
// its hover/active shades, and its Tailwind neutral scale) — not guessed.
// model/human are the app's own semantic colors (Under the hood's code/model/
// human split), kept separate from the LaunchGood brand accent on purpose.
export const colors = {
  ground: "#F5F5F5",
  panel: "#FFFFFF",
  ink: "#171717",
  muted: "#525252",
  faint: "#8A8A8A",
  line: "#E5E7EB",

  brand: "#4AA567",
  brandDeep: "#3C8653",
  brandTint: "#E9F4ED",

  model: "#9A7B1B",
  modelTint: "#F6EFDC",

  human: "#B32D3C",
  humanTint: "#FAE8EA",

  // Kitabisa.com's own brand blue (its most frequent computed color site-wide) —
  // used only as a text accent when naming the platform, never their logo mark.
  kitabisa: "#00AEEF",
} as const;

export const layout = {
  width: 1920,
  height: 1080,
  fps: 30,
  safeX: 160,
} as const;

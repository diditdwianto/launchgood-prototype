import { loadFont } from "@remotion/google-fonts/PlusJakartaSans";

// The exact typeface launchgood.com ships (confirmed via its computed styles).
export const { fontFamily } = loadFont("normal", {
  weights: ["500", "600", "700", "800"],
  subsets: ["latin"],
});

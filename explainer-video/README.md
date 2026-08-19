# Explainer video

A ~5:09 motion-graphics explainer for Campaign Trust Copilot, built with
[Remotion](https://remotion.dev). Themed on launchgood.com's actual computed
styles (Plus Jakarta Sans, `#4AA567` brand green) rather than a generic look —
see `src/theme.ts` and `src/font.ts` for where each value comes from. The
code/model/human owner colors reuse the same three-color system as the app's
own `/under-the-hood` page. Kitabisa.com is named as a text accent in its own
brand blue (`#00AEEF`, pulled from its live computed styles) — never its logo
mark, which isn't reproduced.

Paced deliberately slow for a non-native-English audience — every scene holds
long enough to read twice, not once. Opens with the problem, then a first-
person introduction (a regular Kitabisa.com donor, the fraud that motivated
this build), then walks through what each of the five deterministic pipeline
steps actually does and where its data comes from (e.g. `org_lookup` against
ProPublica's Nonprofit Explorer). Three real flagged examples show the model
step in action — a photo-metadata contradiction, an impersonation report, and
a lapsed-registration timeline conflict — followed by why Groq and NVIDIA's
*free* tiers were chosen on purpose (low enough limits to actually trigger a
fallback, not just claim to have one) and the real fallback chain itself. A
screen tour then submits a live campaign and runs the actual pipeline on
camera (not a fixture — a live Tavily search and a live model call, with real
latencies), shows a real "Request more information" round trip (model
drafts, a human edits and sends), and closes with three real risk-tier
examples — high risk, escalated, and low risk — followed by two things not
built yet: a learned risk score and automatic re-assessment when an organiser
replies with more evidence.

## A real bug found and fixed along the way

Recording the "Request more information" screen tour surfaced a real bug:
the header-level "Request more information" link (`app/review/[id]/page.tsx`)
opened `ClarificationPanel` with no flag selected, and on a campaign with no
prior clarification history the panel rendered nothing but its own header —
no content, no guidance, functionally invisible. Fixed in
`frontend/components/ClarificationPanel.tsx` to show a clear empty state
directing the reviewer to a flag's own "Draft a request" button instead
(drafting requires a specific claim and evidence, which only a flag has).
Verified live before and after; the "fixed" state is what the video shows.

## Structure

- `src/script.ts` — scene order and duration (frames @ 30fps), single source
  of truth for timing. Every duration already includes a flat +45 frame
  (1.5s) hold on top of its base timing.
- `src/scenes/` — one component per scene with custom animation. Plain-text
  scenes are inlined directly in `src/Explainer.tsx` via the shared
  `Statement` component.
- `src/components/` — reusable pieces: `Logo`, `PillBadge`, `PipelineDiagram`
  (builds progressively across scenes, node by node), `PipelineStepScene`
  (shared layout for a single pipeline-step beat), `ModelChain` (the
  Groq→NVIDIA fallback visual, with an exhausted/active state), `Screenshot`
  (frames a real capture from `public/screens/`), `ScreenshotBeat` (shared
  eyebrow + screenshot + caption layout, used by the model examples and the
  screen tour), `Statement`/`Emphasis`, `SceneFade` (the one fade/lift
  transition used throughout).
- `public/screens/` — real screenshots captured from the running app (not
  mockups): sign-in, the queue, the submit form, a live pipeline run
  mid-execution and its completed result, a drafted "request more
  information" message, and the evidence trail for six different flagged
  campaigns (high-risk, escalated, low-risk, and three distinct model-caught
  contradictions). Recapture these with the Chrome extension if the UI
  changes materially.

## Preview

```bash
npm i
npx remotion studio --no-open
```

## Render

```bash
npx remotion render Explainer out/campaign-trust-copilot-explainer.mp4
```

## Editing the script

Change the copy directly in `src/Explainer.tsx` (plain-text scenes) or the
relevant file in `src/scenes/`. Change pacing in `src/script.ts` — every
scene's `from` offset is derived automatically, so reordering or resizing one
scene doesn't require touching the others.

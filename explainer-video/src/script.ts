// Single source of truth for scene order and timing, in frames at 30fps.
// Paced deliberately slow — every duration already includes a flat +45 frame
// (1.5s) hold on top of its original timing, so each beat gives a non-native
// English reader real time to read it twice.
export const scenes = [
  { id: "title", duration: 195 },
  { id: "problem1", duration: 195 },
  { id: "problem2", duration: 180 },
  { id: "problem3", duration: 225 },
  { id: "personalIntro1", duration: 180 },
  { id: "personalIntro1b", duration: 240 },
  { id: "personalIntro2", duration: 225 },
  { id: "personalIntro3", duration: 240 },
  { id: "idea1", duration: 210 },
  { id: "idea2", duration: 180 },
  { id: "pipelineIntro", duration: 165 },
  { id: "stepIntake", duration: 175 },
  { id: "stepOrgLookup1", duration: 240 },
  { id: "stepOrgLookup2", duration: 255 },
  { id: "stepDuplicateCheck", duration: 225 },
  { id: "stepAskMedia", duration: 240 },
  { id: "stepWebSearch", duration: 210 },
  { id: "pipelineModel", duration: 225 },
  { id: "modelExample1", duration: 255 },
  { id: "modelExample2", duration: 255 },
  { id: "modelExample3", duration: 255 },
  { id: "aiWhyChoice", duration: 240 },
  { id: "aiProviderChain", duration: 285 },
  { id: "aiFallback", duration: 285 },
  { id: "pipelineHuman", duration: 225 },
  { id: "principleScore", duration: 240 },
  { id: "principleEvidence", duration: 240 },
  { id: "principleHonest", duration: 225 },
  { id: "screenTourLogin", duration: 195 },
  { id: "screenTourQueue", duration: 225 },
  { id: "screenTourSubmit", duration: 240 },
  { id: "screenTourPipelineLive", duration: 255 },
  { id: "screenTourResult", duration: 285 },
  { id: "screenTourClarify", duration: 255 },
  { id: "riskHigh", duration: 255 },
  { id: "riskEscalated", duration: 255 },
  { id: "riskLow", duration: 240 },
  { id: "futureIntro", duration: 195 },
  { id: "futureML", duration: 255 },
  { id: "futureMLData", duration: 240 },
  { id: "futureAutomation", duration: 285 },
  { id: "close", duration: 225 },
] as const;

export type SceneId = (typeof scenes)[number]["id"];

export const sceneStart = (id: SceneId): number => {
  let frame = 0;
  for (const scene of scenes) {
    if (scene.id === id) return frame;
    frame += scene.duration;
  }
  throw new Error(`Unknown scene id: ${id}`);
};

export const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);

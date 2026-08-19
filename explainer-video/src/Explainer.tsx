import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { scenes, sceneStart } from "./script";
import { fontFamily } from "./font";
import { colors } from "./theme";

import { Title } from "./scenes/Title";
import { PersonalIntro1 } from "./scenes/PersonalIntro1";
import { PersonalIntro1b } from "./scenes/PersonalIntro1b";
import { PersonalIntro2 } from "./scenes/PersonalIntro2";
import { PersonalIntro3 } from "./scenes/PersonalIntro3";
import { PipelineIntro } from "./scenes/PipelineIntro";
import { StepIntake } from "./scenes/StepIntake";
import { StepOrgLookup1 } from "./scenes/StepOrgLookup1";
import { StepOrgLookup2 } from "./scenes/StepOrgLookup2";
import { StepDuplicateCheck } from "./scenes/StepDuplicateCheck";
import { StepAskMedia } from "./scenes/StepAskMedia";
import { StepWebSearch } from "./scenes/StepWebSearch";
import { PipelineModel } from "./scenes/PipelineModel";
import { ModelExample1 } from "./scenes/ModelExample1";
import { ModelExample2 } from "./scenes/ModelExample2";
import { ModelExample3 } from "./scenes/ModelExample3";
import { AiWhyChoice } from "./scenes/AiWhyChoice";
import { AiProviderChain } from "./scenes/AiProviderChain";
import { AiFallback } from "./scenes/AiFallback";
import { PipelineHuman } from "./scenes/PipelineHuman";
import { ScreenTourLogin } from "./scenes/ScreenTourLogin";
import { ScreenTourQueue } from "./scenes/ScreenTourQueue";
import { ScreenTourSubmit } from "./scenes/ScreenTourSubmit";
import { ScreenTourPipelineLive } from "./scenes/ScreenTourPipelineLive";
import { ScreenTourResult } from "./scenes/ScreenTourResult";
import { ScreenTourClarify } from "./scenes/ScreenTourClarify";
import { RiskHigh } from "./scenes/RiskHigh";
import { RiskEscalated } from "./scenes/RiskEscalated";
import { RiskLow } from "./scenes/RiskLow";
import { FutureIntro } from "./scenes/FutureIntro";
import { FutureML } from "./scenes/FutureML";
import { FutureMLData } from "./scenes/FutureMLData";
import { FutureAutomation } from "./scenes/FutureAutomation";
import { Close } from "./scenes/Close";
import { SceneFade } from "./components/SceneFade";
import { Statement, Emphasis } from "./components/Statement";

const duration = (id: (typeof scenes)[number]["id"]) =>
  scenes.find((s) => s.id === id)!.duration;

export const Explainer: React.FC = () => {
  return (
    <AbsoluteFill style={{ fontFamily, backgroundColor: colors.ground }}>
      <Sequence name="Title" from={sceneStart("title")} durationInFrames={duration("title")}>
        <Title />
      </Sequence>

      <Sequence
        name="Problem — donors give sight unseen"
        from={sceneStart("problem1")}
        durationInFrames={duration("problem1")}
      >
        <SceneFade durationInFrames={duration("problem1")}>
          <Statement>
            Every year, generous people fund campaigns they&apos;ve never seen in person.
          </Statement>
        </SceneFade>
      </Sequence>

      <Sequence
        name="Problem — most are real, some aren't"
        from={sceneStart("problem2")}
        durationInFrames={duration("problem2")}
      >
        <SceneFade durationInFrames={duration("problem2")}>
          <Statement>
            Most are real. <Emphasis color={colors.human}>Some aren&apos;t.</Emphasis>
          </Statement>
        </SceneFade>
      </Sequence>

      <Sequence
        name="Problem — fraud caught late"
        from={sceneStart("problem3")}
        durationInFrames={duration("problem3")}
      >
        <SceneFade durationInFrames={duration("problem3")}>
          <Statement>
            And fraud isn&apos;t always caught right away — sometimes only after months of
            donations.
          </Statement>
        </SceneFade>
      </Sequence>

      <Sequence
        name="Personal intro — who's talking"
        from={sceneStart("personalIntro1")}
        durationInFrames={duration("personalIntro1")}
      >
        <PersonalIntro1 durationInFrames={duration("personalIntro1")} />
      </Sequence>

      <Sequence
        name="Personal intro — regular Kitabisa donor"
        from={sceneStart("personalIntro1b")}
        durationInFrames={duration("personalIntro1b")}
      >
        <PersonalIntro1b durationInFrames={duration("personalIntro1b")} />
      </Sequence>

      <Sequence
        name="Personal intro — witnessed fraud"
        from={sceneStart("personalIntro2")}
        durationInFrames={duration("personalIntro2")}
      >
        <PersonalIntro2 durationInFrames={duration("personalIntro2")} />
      </Sequence>

      <Sequence
        name="Personal intro — the pivot to the idea"
        from={sceneStart("personalIntro3")}
        durationInFrames={duration("personalIntro3")}
      >
        <PersonalIntro3 durationInFrames={duration("personalIntro3")} />
      </Sequence>

      <Sequence
        name="Idea — catches what a reviewer might miss"
        from={sceneStart("idea1")}
        durationInFrames={duration("idea1")}
      >
        <SceneFade durationInFrames={duration("idea1")}>
          <Statement>
            Campaign Trust Copilot checks what a reviewer might miss — before a campaign
            reaches a donor.
          </Statement>
        </SceneFade>
      </Sequence>

      <Sequence
        name="Idea — not a replacement"
        from={sceneStart("idea2")}
        durationInFrames={duration("idea2")}
      >
        <SceneFade durationInFrames={duration("idea2")}>
          <Statement>
            Not by replacing the reviewer. <Emphasis>By giving them evidence.</Emphasis>
          </Statement>
        </SceneFade>
      </Sequence>

      <Sequence
        name="Pipeline intro"
        from={sceneStart("pipelineIntro")}
        durationInFrames={duration("pipelineIntro")}
      >
        <PipelineIntro />
      </Sequence>

      <Sequence
        name="Step 1 — intake"
        from={sceneStart("stepIntake")}
        durationInFrames={duration("stepIntake")}
      >
        <StepIntake />
      </Sequence>

      <Sequence
        name="Step 2 — org_lookup (registry states)"
        from={sceneStart("stepOrgLookup1")}
        durationInFrames={duration("stepOrgLookup1")}
      >
        <StepOrgLookup1 />
      </Sequence>

      <Sequence
        name="Step 2 — org_lookup (coverage gap)"
        from={sceneStart("stepOrgLookup2")}
        durationInFrames={duration("stepOrgLookup2")}
      >
        <StepOrgLookup2 />
      </Sequence>

      <Sequence
        name="Step 3 — duplicate_check"
        from={sceneStart("stepDuplicateCheck")}
        durationInFrames={duration("stepDuplicateCheck")}
      >
        <StepDuplicateCheck />
      </Sequence>

      <Sequence
        name="Step 4 — ask_and_media"
        from={sceneStart("stepAskMedia")}
        durationInFrames={duration("stepAskMedia")}
      >
        <StepAskMedia />
      </Sequence>

      <Sequence
        name="Step 5 — web_search"
        from={sceneStart("stepWebSearch")}
        durationInFrames={duration("stepWebSearch")}
      >
        <StepWebSearch />
      </Sequence>

      <Sequence
        name="Pipeline — model step"
        from={sceneStart("pipelineModel")}
        durationInFrames={duration("pipelineModel")}
      >
        <PipelineModel />
      </Sequence>

      <Sequence
        name="Model example 1 — Gaza clinic photo contradiction"
        from={sceneStart("modelExample1")}
        durationInFrames={duration("modelExample1")}
      >
        <ModelExample1 durationInFrames={duration("modelExample1")} />
      </Sequence>

      <Sequence
        name="Model example 2 — impersonation report"
        from={sceneStart("modelExample2")}
        durationInFrames={duration("modelExample2")}
      >
        <ModelExample2 durationInFrames={duration("modelExample2")} />
      </Sequence>

      <Sequence
        name="Model example 3 — lapsed registration timeline"
        from={sceneStart("modelExample3")}
        durationInFrames={duration("modelExample3")}
      >
        <ModelExample3 durationInFrames={duration("modelExample3")} />
      </Sequence>

      <Sequence
        name="AI — why Groq and NVIDIA's free tiers"
        from={sceneStart("aiWhyChoice")}
        durationInFrames={duration("aiWhyChoice")}
      >
        <AiWhyChoice durationInFrames={duration("aiWhyChoice")} />
      </Sequence>

      <Sequence
        name="AI provider chain"
        from={sceneStart("aiProviderChain")}
        durationInFrames={duration("aiProviderChain")}
      >
        <AiProviderChain durationInFrames={duration("aiProviderChain")} />
      </Sequence>

      <Sequence
        name="AI fallback mechanism"
        from={sceneStart("aiFallback")}
        durationInFrames={duration("aiFallback")}
      >
        <AiFallback durationInFrames={duration("aiFallback")} />
      </Sequence>

      <Sequence
        name="Pipeline — human step"
        from={sceneStart("pipelineHuman")}
        durationInFrames={duration("pipelineHuman")}
      >
        <PipelineHuman />
      </Sequence>

      <Sequence
        name="Principle — deterministic score"
        from={sceneStart("principleScore")}
        durationInFrames={duration("principleScore")}
      >
        <SceneFade durationInFrames={duration("principleScore")}>
          <Statement>
            The risk score is never the model&apos;s opinion. It&apos;s{" "}
            <Emphasis>arithmetic</Emphasis> — from flags, every time.
          </Statement>
        </SceneFade>
      </Sequence>

      <Sequence
        name="Principle — evidence chain"
        from={sceneStart("principleEvidence")}
        durationInFrames={duration("principleEvidence")}
      >
        <SceneFade durationInFrames={duration("principleEvidence")}>
          <Statement>
            Every flag traces back to its evidence: a registry entry, a fingerprint match,
            a contradiction in the text.
          </Statement>
        </SceneFade>
      </Sequence>

      <Sequence
        name="Principle — honest about limits"
        from={sceneStart("principleHonest")}
        durationInFrames={duration("principleHonest")}
      >
        <SceneFade durationInFrames={duration("principleHonest")}>
          <Statement>
            It&apos;s honest about its own limits, too — this build shows exactly which
            sources are live, and which are mocked for the demo.
          </Statement>
        </SceneFade>
      </Sequence>

      <Sequence
        name="Screen tour — sign in"
        from={sceneStart("screenTourLogin")}
        durationInFrames={duration("screenTourLogin")}
      >
        <ScreenTourLogin />
      </Sequence>

      <Sequence
        name="Screen tour — the queue"
        from={sceneStart("screenTourQueue")}
        durationInFrames={duration("screenTourQueue")}
      >
        <ScreenTourQueue />
      </Sequence>

      <Sequence
        name="Screen tour — submit a campaign"
        from={sceneStart("screenTourSubmit")}
        durationInFrames={duration("screenTourSubmit")}
      >
        <ScreenTourSubmit durationInFrames={duration("screenTourSubmit")} />
      </Sequence>

      <Sequence
        name="Screen tour — pipeline running live"
        from={sceneStart("screenTourPipelineLive")}
        durationInFrames={duration("screenTourPipelineLive")}
      >
        <ScreenTourPipelineLive durationInFrames={duration("screenTourPipelineLive")} />
      </Sequence>

      <Sequence
        name="Screen tour — live result"
        from={sceneStart("screenTourResult")}
        durationInFrames={duration("screenTourResult")}
      >
        <ScreenTourResult durationInFrames={duration("screenTourResult")} />
      </Sequence>

      <Sequence
        name="Screen tour — request more information"
        from={sceneStart("screenTourClarify")}
        durationInFrames={duration("screenTourClarify")}
      >
        <ScreenTourClarify durationInFrames={duration("screenTourClarify")} />
      </Sequence>

      <Sequence
        name="Example — high risk"
        from={sceneStart("riskHigh")}
        durationInFrames={duration("riskHigh")}
      >
        <RiskHigh />
      </Sequence>

      <Sequence
        name="Example — escalated"
        from={sceneStart("riskEscalated")}
        durationInFrames={duration("riskEscalated")}
      >
        <RiskEscalated />
      </Sequence>

      <Sequence
        name="Example — low risk"
        from={sceneStart("riskLow")}
        durationInFrames={duration("riskLow")}
      >
        <RiskLow />
      </Sequence>

      <Sequence
        name="Future — intro"
        from={sceneStart("futureIntro")}
        durationInFrames={duration("futureIntro")}
      >
        <FutureIntro durationInFrames={duration("futureIntro")} />
      </Sequence>

      <Sequence
        name="Future — learned severity weights"
        from={sceneStart("futureML")}
        durationInFrames={duration("futureML")}
      >
        <FutureML durationInFrames={duration("futureML")} />
      </Sequence>

      <Sequence
        name="Future — how much data the model needs"
        from={sceneStart("futureMLData")}
        durationInFrames={duration("futureMLData")}
      >
        <FutureMLData durationInFrames={duration("futureMLData")} />
      </Sequence>

      <Sequence
        name="Future — automatic re-run on reply"
        from={sceneStart("futureAutomation")}
        durationInFrames={duration("futureAutomation")}
      >
        <FutureAutomation durationInFrames={duration("futureAutomation")} />
      </Sequence>

      <Sequence name="Close" from={sceneStart("close")} durationInFrames={duration("close")}>
        <Close />
      </Sequence>
    </AbsoluteFill>
  );
};

import Link from "next/link";

import { SectionLabel } from "@/components/ui";

const STATS = [
  ["In tech", "since 2005"],
  ["Product development", "since 2014"],
  ["Engineering leadership", "since 2016"],
  ["Senior leadership", "since 2019 — VP of Technology, Head of Engineering, CTO, Director"],
  ["Org scale", "Tech orgs up to ~150 staff. Distributed teams across 4 countries"],
] as const;

const ROLES = [
  ["Director of Engineering", "Jublia AI", "2026", "AI-first engineering transformation, RAG, agentic coding"],
  ["Director of Product & Engineering", "CaringUp", "2023–2025", "Digital healthcare, medication adherence"],
  ["CTO, Biofarma Digital", "PT Biofarma (Persero)", "2022–2023", "State-owned pharma holding, ~150 staff, 66 initiatives"],
  ["Head of Engineering", "Siklus Refill", "2021–2022", "Zero-plastic-waste refill delivery"],
  ["Head of Technology", "TabSquare", "2020–2021", "AI-powered in-restaurant F&B tech"],
  ["VP of Technology", "StickEarn", "2017–2020", "Ad-tech; grew engineering from 3 to 31"],
] as const;

const SKILLS = [
  "AI-first engineering & RAG",
  "Agentic AI & coding agents",
  "LLM evaluation & benchmarking",
  "Solution & cloud architecture",
  "Product management",
  "SDLC governance & QA",
  "Regulated environments (health, gov)",
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-[760px] px-10 py-7">
      <div className="mb-8 flex items-start gap-4">
        <span className="bg-brand-tint text-brand-deep flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-[15px] font-semibold">
          DD
        </span>
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Didit Dwianto</h1>
          <p className="text-muted text-[13.5px] leading-relaxed">
            Director of Product &amp; Engineering / Enterprise Architect · Greater
            Jakarta, Indonesia
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
            <a
              href="mailto:didit.dwianto@gmail.com"
              className="text-brand-deep underline underline-offset-4"
            >
              didit.dwianto@gmail.com
            </a>
            <a
              href="https://linkedin.com/in/diditdwianto"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-deep underline underline-offset-4"
            >
              linkedin.com/in/diditdwianto
            </a>
            <a
              href="https://github.com/diditdwianto"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-deep underline underline-offset-4"
            >
              github.com/diditdwianto
            </a>
          </div>
        </div>
      </div>

      <SectionLabel>Who I am</SectionLabel>
      <p className="text-muted mb-8 max-w-[660px] text-[13.5px] leading-relaxed">
        I&apos;m a revert (mualaf) to Islam — I took my shahada in 2012, fourteen
        years ago — and I live in Jakarta, Indonesia. By day I lead
        product and engineering organizations; the largest was around 150 people
        running 66 initiatives across the subsidiaries of a state-owned pharma
        holding. My focus these days is AI-first engineering: RAG, agentic
        systems, and coding agents, most recently at Jublia AI.
      </p>

      <SectionLabel>Why this project</SectionLabel>
      <p className="text-muted mb-8 max-w-[660px] text-[13.5px] leading-relaxed">
        I&apos;m a regular user of Kitabisa.com and similar donation-based
        crowdfunding platforms here in Indonesia — giving sedekah and zakat
        through them is routine. And it comes with a routine problem: it is
        genuinely hard, as a donor, to tell a legitimate campaign from a
        fabricated one. Photos get reused, organizers can&apos;t always be
        verified, and the ask itself is sometimes wildly out of proportion to
        what&apos;s being described. I&apos;ve felt that uncertainty myself more
        than once before deciding whether to give.
        <br />
        <br />
	There have been some issue where some campaign was found to be fraud after going live for several months and collects lots of donation. 
	And public found out about this because some people decide to dig deeper of the campaign, the actual location, the fundraiser, 
	and everything under the hood, that possibly missed by manual reviewer.
	<br />
	<br />
        That&apos;s the problem this build is aimed at — not a hypothetical
        exercise, but the same trust gap I run into as a donor on a platform not
        so different from LaunchGood. The{" "}
        <Link href="/under-the-hood" className="text-brand-deep underline underline-offset-4">
          Campaign Trust Copilot
        </Link>{" "}
        is my answer to it: evidence gathered deterministically where it can
        be, judgment applied by a model where it must be, and a human who
        always makes the final call.
      </p>

      <SectionLabel>Background</SectionLabel>
      <div className="bg-panel border-line mb-8 rounded-lg border">
        {STATS.map(([label, value]) => (
          <div
            key={label}
            className="border-line flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0"
          >
            <span className="w-[170px] flex-shrink-0 text-[12.5px] font-medium">
              {label}
            </span>
            <span className="text-muted flex-1 text-[12.5px]">{value}</span>
          </div>
        ))}
      </div>

      <SectionLabel>Selected roles</SectionLabel>
      <div className="bg-panel border-line mb-8 rounded-lg border">
        {ROLES.map(([title, org, period, note]) => (
          <div
            key={`${title}-${org}`}
            className="border-line flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0"
          >
            <span className="mono text-muted w-[80px] flex-shrink-0 text-[11px]">
              {period}
            </span>
            <div className="flex-1">
              <span className="text-[12.5px] font-medium">{title}</span>
              <span className="text-muted text-[12.5px]"> · {org}</span>
            </div>
            <span className="text-muted hidden max-w-[240px] flex-shrink-0 text-[11.5px] sm:block">
              {note}
            </span>
          </div>
        ))}
      </div>

      <SectionLabel>Skills</SectionLabel>
      <div className="mb-8 flex flex-wrap gap-2">
        {SKILLS.map((s) => (
          <span
            key={s}
            className="bg-brand-tint text-brand-deep rounded-full px-3 py-1 text-[12px] font-medium"
          >
            {s}
          </span>
        ))}
      </div>

      <p className="text-muted mono text-[11px]">
        Full CV available on request — {" "}
        <a
          href="mailto:didit.dwianto@gmail.com"
          className="text-brand-deep underline underline-offset-4"
        >
          didit.dwianto@gmail.com
        </a>
      </p>
    </div>
  );
}

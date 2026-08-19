import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeft, ArrowRight, MousePointerClick, Clock, Mail, HelpCircle,
  CheckCircle2, FileCode2, PlayCircle, BookOpen,
} from 'lucide-react';
import { CONTACT_EMAIL } from '@/lib/constants';
import { STARTER_EXAMPLES } from '@/lib/starter-examples';

export const metadata: Metadata = {
  title: 'Your First Run — Step by Step | Clean-Core.io',
  description:
    'Click-by-click walkthrough of your first ABAP analysis on Clean-Core.io: pick a starter example, read the Clean Core Score, and take the package with you. No SAP connection and no code of your own required.',
  alternates: { canonical: 'https://clean-core.io/first-run' },
  openGraph: {
    title: 'Your First Run — Step by Step | Clean-Core.io',
    description:
      'Click-by-click walkthrough of your first ABAP analysis. No SAP connection and no code of your own required.',
    url: 'https://clean-core.io/first-run',
    type: 'article',
    siteName: 'Clean-Core.io',
  },
};

/**
 * The click-by-click first run.
 *
 * `/how-to` explains what the platform is; this page assumes the reader is
 * already convinced and just wants to be told which button to press. Every step
 * names the literal on-screen label, because a guide that paraphrases the UI is
 * the guide people give up on.
 */

interface Step {
  n: number;
  where: string;
  action: string;
  detail: string;
  see: string;
  note?: string;
}

const STEPS: Step[] = [
  {
    n: 1,
    where: 'clean-core.io',
    action: 'Sign in with the account you registered',
    detail:
      'Use "Get Free Access" in the top right and sign in with the email address your approval was sent to. You land on the dashboard.',
    see: 'The dashboard, with your transformation balance shown in the header — "0 / 5 Transformations" on a fresh account.',
  },
  {
    n: 2,
    where: 'Dashboard',
    action: 'Scroll to "Try it with an example"',
    detail:
      'Below your projects there is a panel of ready-made legacy reports. They are fictional, but written the way grown enterprise ABAP actually looks — and they are the same objects the analysis engine is regression-tested against.',
    see: `${STARTER_EXAMPLES.length} example cards, each naming the object, its size, and the Clean Core problem it demonstrates.`,
    note: 'This is the step that saves you the most time. Nothing has to be exported from an SAP system, and no customer code leaves anybody\'s estate.',
  },
  {
    n: 3,
    where: 'Dashboard',
    action: 'Click one card — Z_MATERIAL_STOCK_CALC is a good first pick',
    detail:
      'One click creates the project, stages the source, and takes you straight to stage 2. At 99 lines it is small enough to read in full, and it has the single most common Clean Core problem in it: direct reads on MARA, MARC and MARD where released SAP APIs exist.',
    see: 'The Analyze stage, with a green "Source Code Ready" panel confirming the source is staged.',
  },
  {
    n: 4,
    where: 'Stage 2 — Analyze',
    action: 'Start the analysis',
    detail:
      'The deterministic engine parses the source first — findings, database coupling, code inventory, complexity and criticality — and only then does the AI write the narrative around that evidence. Takes a minute or two.',
    see: 'A Clean Core Score, a findings list with line numbers, and a recommended route: in-app ABAP Cloud (RAP) or side-by-side BTP (CAP).',
    note: 'This is the one step that costs a transformation. Everything after it is included, and re-running the analysis on the same source is free.',
  },
  {
    n: 5,
    where: 'Stage 2 — Analyze',
    action: 'Read the findings before moving on',
    detail:
      'Each finding names the offending construct, where it sits, and what to do instead. This is the part worth judging the platform on — if the findings do not match what you know about the object, tell us.',
    see: 'A worklist of findings, each with a severity, a location and a recommendation.',
  },
  {
    n: 6,
    where: 'Stages 3 to 7',
    action: 'Walk the rest of the workflow with the stepper',
    detail:
      'Design drafts the target architecture against released APIs. Transformation generates the RAP or CAP implementation next to the original. Testing generates and runs ABAP Unit tests. Documentation produces BPMN 2.0 and the business-facing procedures. Delivery hands you the package.',
    see: 'The numbered stepper at the top of every stage, from Upload through to Delivery.',
  },
  {
    n: 7,
    where: 'Stage 7 — Delivery',
    action: 'Download the package',
    detail:
      'An abapGit-compatible ZIP with the generated sources and tests, plus the audit evidence pack — a signed record of what was analysed, by which engine and catalog version, and what it concluded. That signature is verifiable later, which is the point of it.',
    see: 'Your download, and a completed project on the dashboard you can return to at any time.',
  },
];

export default function FirstRunPage() {
  const howToSchema = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: 'Your first ABAP analysis on Clean-Core.io',
    description:
      'Click-by-click walkthrough of a first Clean Core analysis, from signing in to downloading the abapGit package and audit evidence.',
    totalTime: 'PT15M',
    step: STEPS.map((s) => ({
      '@type': 'HowToStep',
      position: s.n,
      name: s.action,
      text: s.detail,
    })),
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }} />

      <div className="flex items-center justify-start">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-green-600 transition-all bg-white px-5 py-2.5 rounded-full border border-gray-200 hover:border-green-200 hover:bg-green-50/50 hover:shadow-sm"
        >
          <ArrowLeft size={14} /> Back to Workspace
        </Link>
      </div>

      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white rounded-[2.5rem] p-8 sm:p-12 shadow-2xl relative overflow-hidden border border-slate-700/30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(16,185,129,0.1),transparent)] pointer-events-none" />
        <div className="relative z-10 max-w-3xl space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 bg-green-500/15 border border-green-400/30 px-4 py-1.5 rounded-full text-xs font-bold text-green-400 tracking-wide uppercase">
              <MousePointerClick size={14} /> Step by step
            </span>
            <span className="inline-flex items-center gap-2 bg-white/10 border border-white/20 px-4 py-1.5 rounded-full text-xs font-bold text-slate-300 tracking-wide uppercase">
              <Clock size={13} /> About 15 minutes
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-none text-slate-50">
            Your first run
          </h1>
          <p className="text-lg text-slate-300 leading-relaxed font-medium">
            Seven clicks from signing in to a downloadable package. You do not need an SAP connection,
            you do not need credentials, and you do not need any code of your own — there are examples
            waiting on the dashboard.
          </p>
        </div>
      </div>

      {/* Before you start */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: CheckCircle2, t: 'What you need', d: 'An approved account. That is all — no system connection, no credentials, no data.' },
          { icon: FileCode2, t: 'What it costs', d: 'One of your five transformations, spent at the analysis. The six stages after it are included.' },
          { icon: Clock, t: 'How long', d: 'About fifteen minutes end to end, most of it spent reading the output rather than waiting.' },
        ].map((c) => (
          <div key={c.t} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <c.icon className="w-5 h-5 text-green-600 mb-3" />
            <h2 className="text-sm font-black text-gray-900 uppercase tracking-wide mb-1.5">{c.t}</h2>
            <p className="text-sm text-gray-600 leading-relaxed">{c.d}</p>
          </div>
        ))}
      </div>

      {/* The steps */}
      <ol className="space-y-4 list-none p-0 m-0">
        {STEPS.map((step) => (
          <li key={step.n} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex gap-5 p-6">
              <div className="shrink-0">
                <div className="w-11 h-11 rounded-2xl bg-gray-950 text-white flex items-center justify-center font-black text-lg tabular-nums">
                  {step.n}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{step.where}</span>
                <h2 className="text-lg font-black text-gray-950 leading-snug mt-1 mb-2">{step.action}</h2>
                <p className="text-sm text-gray-600 leading-relaxed mb-4">{step.detail}</p>

                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 flex gap-2.5">
                  <ArrowRight size={14} className="text-green-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-gray-700 leading-relaxed">
                    <span className="font-black text-gray-900 uppercase tracking-wide text-[10px]">You should see: </span>
                    {step.see}
                  </p>
                </div>

                {step.note && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-3.5 flex gap-2.5 mt-2.5">
                    <HelpCircle size={14} className="text-green-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-green-900/80 leading-relaxed">{step.note}</p>
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>

      {/* Which example */}
      <div className="bg-white border border-gray-200 rounded-[2rem] p-8 shadow-sm">
        <h2 className="text-2xl font-black text-gray-950 tracking-tight mb-2">Which example should I pick?</h2>
        <p className="text-sm text-gray-600 leading-relaxed mb-6 max-w-3xl">
          Each one is built around a different Clean Core problem. Start small; the thousand-line
          report is the honest stress test, but it produces a lot to read.
        </p>
        <div className="space-y-2.5">
          {STARTER_EXAMPLES.map((ex) => (
            <div key={ex.file} className="border border-gray-200 rounded-xl p-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-[13px] font-bold text-gray-900">{ex.name}</span>
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 tabular-nums">
                {ex.lines.toLocaleString()} lines
              </span>
              <p className="text-xs text-gray-600 leading-relaxed w-full">{ex.demonstrates}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Help + next */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-7 text-white">
          <h2 className="flex items-center gap-2 text-base font-black uppercase tracking-wide mb-3">
            <Mail size={16} className="text-green-400" /> Something not working?
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed mb-5">
            Write to us. Questions about the output, an object the engine handled badly, a stage that
            failed — all of it is useful, and a person answers.
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="inline-flex items-center gap-2 bg-white text-slate-900 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-green-50 transition-colors"
          >
            {CONTACT_EMAIL}
          </a>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-7 shadow-sm flex flex-col">
          <h2 className="flex items-center gap-2 text-base font-black text-gray-900 uppercase tracking-wide mb-3">
            <BookOpen size={16} className="text-green-600" /> Want the background first?
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed mb-5 flex-grow">
            The How-To Guide walks through the same workflow narrated, with the reasoning behind each
            stage and what the Clean Core paradigm is actually asking of you.
          </p>
          <Link
            href="/how-to"
            className="inline-flex items-center gap-2 text-green-700 border border-green-200 bg-green-50 hover:bg-green-100 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-colors self-start"
          >
            Open the How-To Guide <ArrowRight size={13} />
          </Link>
        </div>
      </div>

      <div className="text-center pt-2 pb-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-10 py-4 rounded-xl font-black text-sm uppercase tracking-wider shadow-lg transition-all"
        >
          <PlayCircle size={17} /> Start your first run
        </Link>
      </div>
    </div>
  );
}

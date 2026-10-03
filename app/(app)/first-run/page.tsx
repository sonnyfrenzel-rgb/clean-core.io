import { jsonLdHtml } from '@/lib/json-ld';
import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import Link from 'next/link';
import BackLink from '@/components/BackLink';
import {
  ArrowRight, MousePointerClick, Clock, Mail,
  CheckCircle2, FileCode2, PlayCircle, BookOpen,
} from 'lucide-react';
import CcMessageStrip from '@/components/cc/MessageStrip';
import { publicButton } from '@/components/landing/public-button';
import { formatNumber } from '@/lib/format';
import { CONTACT_EMAIL } from '@/lib/constants';
import { STARTER_EXAMPLES } from '@/lib/starter-examples';
import { BTP_FIRST } from '@/lib/sap-naming';

export const metadata: Metadata = withTwitterCard({
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
});

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
      'Use "Get Free Access" in the top right. Registering activates the account immediately — there is nothing to approve and no waiting list — and you land on the dashboard.',
    // Roadmap 0.2 (UX-084). This line quoted the header as "0 / 5
    // Transformations" — used-of-total — while the header itself has said
    // remaining-of-total since the dashboard and the transformation stage were
    // reconciled. Same number, opposite direction, on the one screen where a
    // reader is working out what the thing costs. The wording is the header's
    // own, and `tests/claims-honesty-guard.spec.ts` reads both from the
    // rendered pages so the two cannot drift apart again.
    see: 'The dashboard, with your transformation balance shown in the header — "5 of 5 left" on a fresh account.',
  },
  {
    n: 2,
    where: 'Dashboard',
    action: 'Scroll to "Try it with an example"',
    detail:
      'Below your projects there is a panel of ready-made legacy reports. They are fictional, but written the way grown enterprise ABAP actually looks — and they are the same objects the analysis engine is regression-tested against.',
    see: 'One recommended example under "Start here", three more chosen for what they show, and the rest behind "More examples" — each card naming the object, its size, and the Clean Core problem it demonstrates.',
    note: 'This is the step that saves you the most time. Nothing has to be exported from an SAP system, and no customer code leaves anybody\'s estate.',
  },
  {
    n: 3,
    where: 'Dashboard',
    action: 'Press Start on the card under "Start here" — Z_MM_PO_APPROVAL, the case the demo project is built on',
    detail:
      'One click creates the project and opens its workspace, and the start is the analysis: the deterministic engine reads the source and the result is sealed as a signed run. With the model on, the narrative is written into the same run while you watch; without it, the engine’s reading is signed alone. At 668 lines it is a real approval process — vendor block list, price tolerance, approval by department head or manager — and it shows the honest gaps too: two includes the code names but does not contain are marked Not determined, never guessed.',
    see: 'The first look, about 20 seconds in six steps — the code read, the process recognised, plain names, the rules hard-coded in the program, what could not be determined, and your process as numbered steps beside the map. Pause or skip it at any time.',
    note: 'This is the one step that costs a transformation — except the starter examples, which are free the first time you run each of them. Everything after it is included, and re-running the analysis on the same source is free; starting the same example a second time is an ordinary analysis, counted once it completes.',
  },
  {
    n: 4,
    where: 'Workspace — Business view',
    action: 'Decide on the rules',
    detail:
      'The Business view opens with one next step — "Decide on n rules" — then the process as numbered steps in plain words, what it decides and what it changes. For each rule the program hard-codes, answer Keep, Change, Drop or Clarify; a Clarify names the question and who should answer it.',
    see: 'The business rules, unanswered first, and the next step moving on once every rule has an answer.',
  },
  {
    n: 5,
    where: 'Analyze',
    action: 'Open Analyze and read the findings',
    detail:
      'Each finding names the offending construct, where it sits, and what to do instead. This is the part worth judging the platform on — if the findings do not match what you know about the object, tell us.',
    see: `A Clean Core Score, a worklist of findings, each with a severity, a location and a recommendation, and a recommended route: in-app ABAP Cloud (RAP) or side-by-side CAP on ${BTP_FIRST}.`,
  },
  {
    n: 6,
    where: 'Stages 2 to 7',
    action: 'Open the other tools from the workspace',
    detail:
      'Design drafts the target architecture against released APIs when it opens. Transformation generates the RAP or CAP implementation next to the original. Documentation writes a process description from the code when it opens, with BPMN 2.0 beside it. Testing generates test cases: on the CAP route it runs them against mocks, never in your system; on the ABAP Cloud route you record the ABAP Unit result from your own SAP system. Economics models the upgrade cost on assumptions you enter. Delivery hands you the package.',
    see: 'The tools bar of the workspace and of every tool, from Analyze through to Delivery — a check where a phase is done, its own mark where work has started, amber where something on record is out of date.',
  },
  {
    n: 7,
    where: 'Stage 7 — Delivery',
    action: 'Download the package',
    detail:
      'An abapGit-compatible ZIP with the generated sources and tests, plus the audit evidence pack — a signed record of what was analysed, by which engine and catalog version, and what it concluded. That signature is verifiable later, which is the point of it.',
    see: 'Your download, and the project on the dashboard with the state of each phase, to return to at any time.',
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
    <div className="space-y-8 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(howToSchema) }} />

      {/* UX-104: this guide is written for someone who has not signed in yet, and
          it was offering them a way "back" to a page behind the login. */}
      <div className="flex items-center justify-start">
        <BackLink />
      </div>

      {/* Header */}
      <div className="bg-cc-surface rounded-3xl p-8 sm:p-12 border border-cc-line">
        <div className="max-w-3xl space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 bg-cc-brand-surface border border-cc-brand px-4 py-1 rounded-full text-xs font-bold text-cc-brand-strong tracking-wide uppercase">
              <MousePointerClick size={14} aria-hidden="true" /> Step by step
            </span>
            <span className="inline-flex items-center gap-2 bg-cc-surface-muted border border-cc-line px-4 py-1 rounded-full text-xs font-bold text-cc-ink-muted tracking-wide uppercase">
              <Clock size={14} aria-hidden="true" /> About 15 minutes
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-none text-cc-ink">
            Your first run
          </h1>
          <p className="text-lg text-cc-ink-muted leading-relaxed font-medium">
            Seven clicks from signing in to a downloadable package. You do not need an SAP connection,
            you do not need credentials, and you do not need any code of your own — there are examples
            waiting on the dashboard.
          </p>
        </div>
      </div>

      {/* Before you start */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: CheckCircle2, t: 'What you need', d: 'An account. That is all — no approval to wait for, no system connection, no credentials, no data.' },
          { icon: FileCode2, t: 'What it costs', d: 'Nothing for a starter example the first time you run it. Any other analysis spends one of your five transformations when it completes. The six stages after it are included.' },
          { icon: Clock, t: 'How long', d: 'About fifteen minutes end to end, most of it spent reading the output rather than waiting.' },
        ].map((c) => (
          <div key={c.t} className="bg-cc-surface border border-cc-line rounded-2xl p-5">
            <c.icon className="w-5 h-5 text-cc-brand-strong mb-3" aria-hidden="true" />
            <h2 className="text-sm font-extrabold text-cc-ink uppercase tracking-wide mb-2">{c.t}</h2>
            <p className="text-sm text-cc-ink-muted leading-relaxed">{c.d}</p>
          </div>
        ))}
      </div>

      {/* The steps */}
      <ol className="space-y-4 list-none p-0 m-0">
        {STEPS.map((step) => (
          <li key={step.n} className="bg-cc-surface border border-cc-line rounded-2xl overflow-hidden">
            <div className="flex gap-5 p-6">
              <div className="shrink-0">
                <div className="w-11 h-11 rounded-2xl bg-cc-surface-dark text-cc-on-dark flex items-center justify-center font-extrabold text-lg tabular-nums">
                  {step.n}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <span className="cc-text-label text-cc-ink-muted">{step.where}</span>
                <h2 className="text-lg font-extrabold text-cc-ink leading-snug mt-1 mb-2">{step.action}</h2>
                <p className="text-sm text-cc-ink-muted leading-relaxed mb-4">{step.detail}</p>

                <div className="bg-cc-surface-muted border border-cc-line rounded-xl p-3 flex gap-2">
                  <ArrowRight size={14} className="text-cc-brand-strong shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-xs text-cc-ink leading-relaxed">
                    <span className="cc-text-label text-cc-ink">You should see: </span>
                    {step.see}
                  </p>
                </div>

                {step.note && (
                  <div className="mt-2">
                    <CcMessageStrip state="information">{step.note}</CcMessageStrip>
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>

      {/* Which example */}
      <div className="bg-cc-surface border border-cc-line rounded-3xl p-8">
        <h2 className="text-2xl font-extrabold text-cc-ink tracking-tight mb-2">Which example should I pick?</h2>
        <p className="text-sm text-cc-ink-muted leading-relaxed mb-6 max-w-3xl">
          Each one is built around a different Clean Core problem. Start small; the thousand-line
          report is the honest stress test, but it produces a lot to read.
        </p>
        <div className="space-y-2">
          {STARTER_EXAMPLES.map((ex) => (
            <div key={ex.file} className="border border-cc-line rounded-xl p-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-cc-mono text-[13px] font-bold text-cc-ink">{ex.name}</span>
              <span className="cc-text-label text-cc-ink-muted tabular-nums">
                {formatNumber(ex.lines)} lines
              </span>
              <p className="text-xs text-cc-ink-muted leading-relaxed w-full">{ex.demonstrates}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Help + next */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-cc-surface border border-cc-line rounded-2xl p-7 flex flex-col">
          <h2 className="flex items-center gap-2 text-base font-extrabold text-cc-ink uppercase tracking-wide mb-3">
            <Mail size={16} className="text-cc-brand-strong" aria-hidden="true" /> Something not working?
          </h2>
          <p className="text-sm text-cc-ink-muted leading-relaxed mb-5 flex-grow">
            Write to us. Questions about the output, an object the engine handled badly, a stage that
            failed — all of it is useful, and a person answers.
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className={`${publicButton('ghost', 'sm')} self-start`}
          >
            {CONTACT_EMAIL}
          </a>
        </div>

        <div className="bg-cc-surface border border-cc-line rounded-2xl p-7 flex flex-col">
          <h2 className="flex items-center gap-2 text-base font-extrabold text-cc-ink uppercase tracking-wide mb-3">
            <BookOpen size={16} className="text-cc-brand-strong" aria-hidden="true" /> Want the background first?
          </h2>
          <p className="text-sm text-cc-ink-muted leading-relaxed mb-5 flex-grow">
            The How-To Guide walks through the same workflow narrated, with the reasoning behind each
            stage and what the Clean Core paradigm is actually asking of you.
          </p>
          <Link
            href="/how-to"
            className={`${publicButton('secondary', 'sm')} self-start`}
          >
            Open the How-To Guide <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className="text-center pt-2 pb-4">
        <Link
          href="/dashboard"
          className={publicButton('primary')}
        >
          <PlayCircle size={16} aria-hidden="true" /> Start your first run
        </Link>
      </div>
    </div>
  );
}

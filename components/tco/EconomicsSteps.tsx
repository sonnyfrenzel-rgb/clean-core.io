'use client';

import React, { type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import CcStateText from '@/components/cc/StateText';
import {
  PROPOSED_DAYS_PER_1000_LINES,
  PROPOSED_MAINTENANCE_PER_1000_LINES,
  formatUplift,
  type BaselineProposal,
} from '@/lib/cost-assumptions';
import { formatDays, formatLines } from '@/lib/format';

/**
 * Economics as a guided flow of four numbered steps (owner, 03.10.2026: "the
 * user doesn't find their way here … needs more guidance for this tool").
 *
 *   1. Your codebase — read from the signed run.
 *   2. Your rates — what a day costs, the currency, the time horizon.
 *   3. Effort per option — the proposal from the code size, taken over or changed.
 *   4. Result — the options compared, and the savings forecast.
 *
 * It replaces the object-page head of 01.10.2026 (four facet tiles, a status
 * line, an anchor bar and a donut), which answered "how many inputs" before it
 * said what to do. The steps say where each one stands and the guide above
 * them names the one next action; the depth is unchanged, only its order
 * (DESIGN.md §2.11: one next action, everything else one action deeper).
 *
 * A step's state is a reading of the page's own checklist rows
 * (`lib/economics-checklist.ts`), so a step cannot call itself done while the
 * comparison still refuses because of it. "Done" is drawn in the information
 * colour, never green: a figure the reader typed is theirs, not evidence (§1.1).
 */

export type StepState = 'done' | 'input' | 'proposal' | 'waiting';

export interface EconomicsStepInfo {
  n: 1 | 2 | 3 | 4;
  /** The section the step is drawn in. */
  id: string;
  title: string;
  state: StepState;
  /** What "waiting" waits for, in a few words. */
  waitingFor?: string;
}

export function stepWord(step: Pick<EconomicsStepInfo, 'state' | 'waitingFor'>): string {
  switch (step.state) {
    case 'done':
      return 'Done';
    case 'input':
      return 'Your input needed';
    case 'proposal':
      return 'Proposal available';
    default:
      return step.waitingFor ? `Waits for ${step.waitingFor}` : 'Waiting';
  }
}

function StepStateText({ step }: { step: EconomicsStepInfo }) {
  const word = stepWord(step);
  if (step.state === 'done') return <CcStateText state="information">{word}</CcStateText>;
  if (step.state === 'proposal') return <CcStateText state="warning">{word}</CcStateText>;
  return (
    <CcStateText state="neutral" hollow>
      {word}
    </CcStateText>
  );
}

/** The step's number in a circle — a check once it is done, ink while it is next. */
function StepNumber({ step, next }: { step: EconomicsStepInfo; next: boolean }) {
  return (
    <span
      aria-hidden={true}
      className={cn(
        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold',
        step.state === 'done'
          ? 'bg-cc-information text-cc-surface'
          : next
            ? 'bg-cc-ink text-cc-surface'
            : 'border border-cc-field-border bg-cc-surface text-cc-ink',
      )}
    >
      {step.state === 'done' ? <Check size={15} strokeWidth={3} /> : step.n}
    </span>
  );
}

/**
 * The guide at the top of the stage: the four steps at a glance, each a link
 * to its section, and under them the one next action — a sentence and a
 * primary button. A second, quieter action stands beside it only when there is
 * a proposal to take over while the next step is another one, because the
 * take-over is the action readers could not find.
 */
export function EconomicsGuide({
  title = 'Four steps to a cost comparison',
  steps,
  next,
  sentence,
  action,
  secondary,
}: {
  title?: string;
  steps: EconomicsStepInfo[];
  /** The step the next action belongs to, or `null` once every step is done. */
  next: EconomicsStepInfo | null;
  sentence: ReactNode;
  action: ReactNode;
  secondary?: ReactNode;
}) {
  const done = steps.filter((s) => s.state === 'done').length;
  return (
    <nav
      aria-label="Steps of Economics"
      data-economics-steps=""
      className="cc-card cc-no-print rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc md:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="cc-text-h2 text-cc-ink">{title}</h2>
        <span className="cc-text-meta font-medium text-cc-ink-muted" data-economics-steps-done="">
          {done} of {steps.length} done
        </span>
      </div>
      {/* On a phone the next action comes first and the steps follow it, so the
          one thing to do is on the first screen (DESIGN.md §2.11). */}
      <div className="mt-3 flex flex-col gap-3 md:gap-0">
        <ol className="order-2 m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 md:order-1 lg:grid-cols-4">
          {steps.map((step) => {
            const isNext = next?.n === step.n;
            return (
              <li key={step.n} data-economics-step-pill={step.n} data-step-state={step.state} className="min-w-0">
                <a
                  href={`#${step.id}`}
                  aria-current={isNext ? 'step' : undefined}
                  className={cn(
                    'flex min-h-11 items-center gap-3 rounded-cc-card border px-3 py-2 text-cc-ink no-underline',
                    isNext ? 'border-cc-ink' : 'border-cc-line',
                  )}
                >
                  <StepNumber step={step} next={isNext} />
                  <span className="min-w-0">
                    <span className="block cc-text-cell font-semibold text-cc-ink">{step.title}</span>
                    <StepStateText step={step} />
                  </span>
                </a>
              </li>
            );
          })}
        </ol>
        <div
          data-economics-next={next ? next.n : 'none'}
          className="order-1 flex flex-col gap-3 border-b border-cc-line pb-4 md:order-2 md:mt-4 md:flex-row md:items-center md:justify-between md:border-t md:border-b-0 md:pt-4 md:pb-0"
        >
          <p className="m-0 cc-text-body text-cc-ink">
            <span className="font-semibold">{next ? `Next — step ${next.n}: ` : 'All steps done: '}</span>
            {sentence}
          </p>
          <div className="flex flex-wrap gap-2">
            {action}
            {secondary}
          </div>
        </div>
      </div>
    </nav>
  );
}

/**
 * One step of the stage: its number and state, its title, one line of what to
 * do and why, and its content. The next step is outlined in ink.
 */
export function EconomicsStep({
  step,
  next,
  guidance,
  right,
  children,
}: {
  step: EconomicsStepInfo;
  next: boolean;
  guidance: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  const headingId = `${step.id}-title`;
  return (
    <section
      id={step.id}
      aria-labelledby={headingId}
      data-economics-step={step.n}
      data-step-state={step.state}
      data-step-next={next ? 'true' : undefined}
      className={cn(
        'cc-card scroll-mt-32 rounded-cc-card border bg-cc-surface shadow-cc',
        next ? 'border-cc-ink' : 'border-cc-line',
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 md:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <StepNumber step={step} next={next} />
          <div className="min-w-0">
            <h2 id={headingId} className="cc-text-h2 text-cc-ink">
              <span className="sr-only">Step {step.n}: </span>
              {step.title}
            </h2>
            <StepStateText step={step} />
          </div>
        </div>
        {right}
      </header>
      <p className="m-0 mt-2 px-4 cc-text-cell text-cc-ink-muted md:px-5" data-economics-step-guidance="">
        {guidance}
      </p>
      <div className="px-4 pt-3 pb-4 md:px-5 md:pb-5">{children}</div>
    </section>
  );
}

/**
 * The fixed factors the per-option proposal is computed from, per 1,000 lines
 * (`PROPOSED_DAYS_PER_1000_LINES`), and the maintenance factors per 1,000
 * lines and year behind the baseline proposal for Keep and Do nothing
 * (`PROPOSED_MAINTENANCE_PER_1000_LINES`, owner 03.10.2026) — written out, so a
 * reader sees what the "Take over" button would put into an option before
 * pressing it.
 */
export function ProposalFactors({ loc, baseline }: { loc: number; baseline?: BaselineProposal | null }) {
  const f = PROPOSED_DAYS_PER_1000_LINES;
  const m = PROPOSED_MAINTENANCE_PER_1000_LINES;
  const n = (v: number) => formatDays(v) ?? String(v);
  const tiles = [
    { key: 'dev-once', label: 'Dev days once', value: `${n(f.oneOffDevLow)}–${n(f.oneOffDevHigh)}`, unit: 'per 1,000 lines' },
    { key: 'test-once', label: 'Test days once', value: `${n(f.oneOffTestLow)}–${n(f.oneOffTestHigh)}`, unit: 'per 1,000 lines' },
    { key: 'dev-release', label: 'Dev days per release', value: n(f.perReleaseDev), unit: 'per 1,000 lines' },
    { key: 'test-release', label: 'Test days per release', value: n(f.perReleaseTest), unit: 'per 1,000 lines' },
    ...(baseline
      ? [
          { key: 'dev-maintenance', label: 'Maintenance dev days', value: n(m.devPerYear), unit: 'per 1,000 lines and year' },
          { key: 'test-maintenance', label: 'Maintenance test days', value: n(m.testPerYear), unit: 'per 1,000 lines and year' },
        ]
      : []),
  ];
  return (
    <>
      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 lg:grid-cols-4">
        {tiles.map((t) => (
          <li
            key={t.key}
            data-economics-factor={t.key}
            className="flex min-w-0 flex-col rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3"
          >
            <span className="cc-text-label text-cc-ink-muted">{t.label}</span>
            <span className="mt-1 cc-text-figure text-cc-ink">{t.value}</span>
            <span className="cc-text-meta font-medium text-cc-ink-muted">{t.unit}</span>
          </li>
        ))}
      </ul>
      <p className="m-0 mt-3 cc-text-meta text-cc-ink-muted">
        Fixed factors on {formatLines(loc)} lines; nothing measured them. They count as your assumption only once you
        confirm them.
      </p>
      {baseline ? (
        <p className="m-0 mt-2 cc-text-meta text-cc-ink-muted" data-economics-baseline-formula="">
          The maintenance baseline of Keep and Do nothing is the lines in thousands times the maintenance factors
          {baseline.score === null
            ? ' — there is no Clean Core Score from the signed run, so no uplift is applied'
            : ` times 1 + (100 − score) / 100, which is ${formatUplift(baseline.uplift)} for the score of ${baseline.score} from the signed run: code further from clean core costs more to keep running`}
          . Proposed here: {n(baseline.perYear.devDays)} dev and {n(baseline.perYear.testDays)} test days per year.
        </p>
      ) : null}
    </>
  );
}

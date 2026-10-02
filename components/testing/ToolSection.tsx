import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Where a step of a guided flow stands (owner 02.10.2026: the Testing tool is
 * one flow — write, run, check by hand — not tabs inside tabs).
 *
 *   next        the step to do now — the number on ink
 *   done        it has happened — a tick
 *   waiting     it needs an earlier step first — a hollow number
 *   unavailable it does not exist for this project, and the step says why
 *   open        independent of the others; no state word
 */
export type StepState = 'next' | 'done' | 'waiting' | 'unavailable' | 'open';

/** The state word under a step, unless the caller names a more exact one. */
const stateWord = (n: number, state: StepState): string | null =>
  state === 'next'
    ? 'Next step'
    : state === 'done'
      ? 'Done'
      : state === 'waiting'
        ? `After step ${n - 1}`
        : state === 'unavailable'
          ? 'Not available'
          : null;

/**
 * One section of an object page (proposal A `.sec`): a card with an `h2`, an
 * optional count or chip beside it, actions on the right, a muted lead under
 * the title and the body. The `id` is what an in-page link points at.
 *
 * With `step`, the section is a numbered step of a guided flow: the number (or
 * a tick) before the title, and the step's state as a word beside it. The
 * heading's name stays the title — the number is read as "Step n" and the
 * state word sits outside the heading, so neither changes what a screen reader
 * announces as the section's name.
 */
export default function ToolSection({
  id,
  title,
  titleExtra,
  aside,
  actions,
  lead,
  step,
  children,
  ...rest
}: {
  id?: string;
  title: React.ReactNode;
  /** A provenance chip beside the title. */
  titleExtra?: React.ReactNode;
  /** A muted count on the right of the header. */
  aside?: React.ReactNode;
  actions?: React.ReactNode;
  lead?: React.ReactNode;
  /** `word` replaces the default state word ("Not run here" for a run that cannot happen). */
  step?: { n: number; state: StepState; word?: string };
  children?: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, 'title' | 'id' | 'children'>) {
  const headingId = id ? `${id}-title` : undefined;
  const word = step ? (step.word ?? stateWord(step.n, step.state)) : null;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      data-step-state={step?.state}
      className={cn(
        'min-w-0 scroll-mt-32 rounded-cc-card border bg-cc-surface shadow-cc',
        step?.state === 'next' ? 'border-cc-ink' : 'border-cc-line',
      )}
      {...rest}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          {step ? (
            <span
              aria-hidden={true}
              className={cn(
                'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full cc-text-meta font-bold',
                step.state === 'next' && 'bg-cc-ink text-cc-on-dark',
                step.state === 'done' && 'border border-cc-line bg-cc-surface-muted text-cc-ink',
                (step.state === 'waiting' || step.state === 'unavailable' || step.state === 'open') &&
                  'border border-cc-field-border text-cc-ink-muted',
              )}
            >
              {step.state === 'done' ? <Check size={14} aria-hidden={true} /> : step.n}
            </span>
          ) : null}
          <h2 id={headingId} className="m-0 flex flex-wrap items-center gap-2 cc-text-h2 text-cc-ink">
            {step ? <span className="sr-only">{`Step ${step.n}: `}</span> : null}
            {title}
            {titleExtra}
          </h2>
          {word ? (
            <span
              data-step-word=""
              className={cn('cc-text-label', step?.state === 'next' ? 'text-cc-ink' : 'text-cc-ink-muted')}
            >
              {word}
            </span>
          ) : null}
        </div>
        {aside ? <span className="cc-text-meta text-cc-ink-muted">{aside}</span> : null}
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      {lead ? <p className="m-0 mt-1 px-4 cc-text-cell text-cc-ink-muted sm:px-5">{lead}</p> : null}
      {/* `toArray` drops null, false and undefined: a body of conditions that are all off is no body. */}
      {React.Children.toArray(children).length > 0 ? <div className="px-4 pt-4 pb-5 sm:px-5">{children}</div> : <div className="pb-4" />}
    </section>
  );
}

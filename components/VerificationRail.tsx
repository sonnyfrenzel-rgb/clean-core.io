'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ListChecks } from 'lucide-react';
import CcDialog from '@/components/cc/Dialog';
import { CC_BUTTON_BASE, CC_BUTTON_DENSITY_CLASSES, CC_BUTTON_VARIANT_CLASSES } from '@/components/cc/Button';
import { cn } from '@/lib/utils';
import { PHASE_TONE_CLASS, phaseTone, type PhaseKey, type RailStep } from '@/lib/workflow-steps';

/**
 * Where am I, what is behind me, what is still open.
 *
 * A seven-phase flow gives the reader a stepper at the top of each page and then
 * lets them scroll two thousand pixels away from it. This rail keeps the answer
 * on screen: the same seven phases, the same circles the stepper uses, in a
 * column down the right edge.
 *
 * It adds no capability. Every state comes from `workflowSteps` — the contract
 * the stepper, the dashboard and the delivery page read too — so the rail
 * reports rather than decides, and it never claims a phase is done on the
 * strength of the page having been opened, which is the mistake stage 7 used to
 * make.
 *
 * It did make a smaller version of that mistake until roadmap 1.7: the dot for
 * the phase you were *on* was painted green before anything else was asked, so
 * opening a phase with nothing on record showed a green dot here and a grey
 * circle in the stepper two hundred pixels above — the same phase, two answers.
 * Colour now comes from `phaseTone` and from nothing else, the tick means `done`
 * exactly as it does in the stepper, and the reader's position is a ring in the
 * product's ink.
 *
 * Desktop only by width, but not hidden on a phone: there it becomes a single
 * button at the bottom-left that opens the same list as a sheet. Both are behind
 * `hidden` at the print breakpoint, because a rail is navigation and navigation
 * does not belong in a printed business case.
 *
 * Block D (D.9): the sheet is a `CcDialog` — the one modal behaviour of the
 * product, with focus kept inside, Escape and a way back to the button that
 * opened it — instead of a hand-built `fixed inset-0` layer; the phone button
 * wears the `ghost` style; the hover card and the lists take the workspace's
 * type scale and tokens. Keyboard focus shows the app-wide ring (§1.6).
 */
export default function VerificationRail({
  steps,
  current,
  projectId,
}: {
  steps: RailStep[];
  current: PhaseKey;
  projectId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);

  const go = (step: RailStep) => {
    setOpen(false);
    router.push(`/project/${projectId}/${step.path}`);
  };

  const doneCount = steps.filter((s) => s.done).length;

  // The same two classes the stepper puts on the same phase, so the two surfaces
  // are not merely consistent in spirit: they compute to the same border and the
  // same background, and `tests/phase-honesty-guard.spec.ts` compares them.
  // Being the current phase adds a ring and changes no colour.
  const dot = (step: RailStep) => {
    const paint = PHASE_TONE_CLASS[phaseTone(step)];
    return `${paint.border} ${paint.surface}${
      step.key === current ? ' ring-2 ring-cc-ink/30 ring-offset-2 ring-offset-cc-page' : ''
    }`;
  };

  // The tick is `done`, as it is in the stepper — the current phase no longer
  // hides it behind a "you are here" dot, which is how the rail came to report a
  // different number of finished phases than the circles above it. Where there
  // is no tick, the reader's position is a small dot in the ink.
  const mark = (step: RailStep) => {
    if (step.done) return <Check size={12} className={PHASE_TONE_CLASS[phaseTone(step)].ink} strokeWidth={3.5} />;
    if (step.key === current) return <span className="h-2 w-2 rounded-full bg-cc-ink" />;
    return null;
  };

  return (
    <>
      {/* ── Desktop: a column at the right edge ─────────────────────────── */}
      <nav
        aria-label="Workflow progress"
        className="hidden 2xl:flex fixed right-5 top-1/2 -translate-y-1/2 z-30 flex-col items-center gap-1 print:hidden"
      >
        {steps.map((step, i) => (
          <div key={step.key} className="flex flex-col items-center">
            <button
              type="button"
              onClick={() => go(step)}
              onMouseEnter={() => setHovered(step.n)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(step.n)}
              onBlur={() => setHovered(null)}
              aria-current={step.key === current ? 'step' : undefined}
              aria-label={`Phase ${step.n}, ${step.label}: ${step.detail}`}
              data-rail-phase={step.key}
              data-phase-state={step.state}
              data-phase-tone={phaseTone(step)}
              className={`relative h-6 w-6 rounded-full border-2 flex items-center justify-center transition-transform duration-200 hover:scale-110 ${dot(step)}`}
            >
              {mark(step)}

              {/* Left, not right: there is no room on the right. */}
              {hovered === step.n && (
                <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 w-56 rounded-cc-card border border-cc-line bg-cc-surface p-3 text-left shadow-cc-dialog pointer-events-none">
                  <span className="block cc-text-label text-cc-ink-muted">
                    Phase {step.n} · {step.badge}
                  </span>
                  <span className="block mt-1 cc-text-h3 text-cc-ink">{step.label}</span>
                  <span className="block mt-1 cc-text-meta text-cc-ink-muted">{step.detail}</span>
                </span>
              )}
            </button>
            {i < steps.length - 1 && (
              <span
                className={`w-0.5 h-4 ${PHASE_TONE_CLASS[phaseTone(step)].fill}`}
                aria-hidden
              />
            )}
          </div>
        ))}
      </nav>

      {/* ── Phone and tablet: one button, one sheet ─────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Workflow progress: ${doneCount} of ${steps.length} phases complete`}
        className={cn(
          CC_BUTTON_BASE,
          CC_BUTTON_VARIANT_CLASSES.ghost,
          CC_BUTTON_DENSITY_CLASSES.cozy,
          '2xl:hidden fixed left-4 bottom-4 z-30 shadow-cc print:hidden',
        )}
      >
        {/* A count of finished phases, not a verdict on them — so the icon is
            ink, not the green this product reserves for proven work. */}
        <ListChecks size={16} aria-hidden="true" />
        <span className="cc-text-label text-cc-ink tabular-nums">
          {doneCount} / {steps.length}
        </span>
      </button>

      <CcDialog
        open={open}
        title="Workflow progress"
        lead={`${doneCount} of ${steps.length} phases complete`}
        onClose={() => setOpen(false)}
      >
        <ol className="m-0 list-none space-y-1 p-0">
          {steps.map((step) => (
            <li key={step.key}>
              <button
                type="button"
                onClick={() => go(step)}
                aria-current={step.key === current ? 'step' : undefined}
                data-rail-sheet-phase={step.key}
                data-phase-tone={phaseTone(step)}
                className={cn(
                  // Selection wears the ink (§1.1), as a frame rather than a surface.
                  'flex w-full items-start gap-3 rounded-cc-row border p-3 text-left transition-colors',
                  step.key === current ? 'border-cc-ink' : 'border-transparent hover:border-cc-line',
                )}
              >
                <span
                  className={`mt-0.5 h-6 w-6 shrink-0 rounded-full border-2 flex items-center justify-center ${dot(step)}`}
                >
                  {mark(step)}
                </span>
                <span className="min-w-0">
                  <span className="block cc-text-h3 text-cc-ink">
                    {step.n}. {step.label}
                    <span className="ml-2 cc-text-label text-cc-ink-muted">{step.badge}</span>
                  </span>
                  <span className="block mt-1 cc-text-meta text-cc-ink-muted">{step.detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </CcDialog>
    </>
  );
}

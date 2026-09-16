import { Check } from 'lucide-react';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { PHASE_TONE_CLASS, phaseTone, type PhaseKey, type RailStep } from '@/lib/workflow-steps';

/**
 * The seven phases across the top of every stage page.
 *
 * It used to decide completion by position: every step left of the open page got
 * a tick, so being on Testing made Design and Transformation read as finished
 * whether anything existed or not, and the progress bar filled to wherever the
 * reader happened to be. It also counted Upload as a phase of its own and had no
 * Economics at all, which is why the TCO page showed itself as step 1.
 *
 * Each circle now shows what `workflowSteps` found on record — the same answer
 * the rail, the dashboard and the delivery page give. The tick means `done`:
 * this phase's own output is on record. The colour means something narrower and
 * comes from `phaseTone`, which the rail and the dashboard read too: green only
 * where something verified the output, amber where it is on record and nothing
 * did, rose where it was built for a previous source, grey where there is
 * nothing. A ticked amber circle is the honest picture of generated code that
 * was never compiled or run (roadmap 1.7).
 *
 * The ring marks where the reader is, in the product's ink and not in green:
 * being on a page has never been evidence of anything.
 */
export default function Stepper({
  steps,
  current,
  projectId,
  basePath,
}: {
  steps: RailStep[];
  current: PhaseKey;
  projectId: string;
  /**
   * What the seven links are relative to. Defaults to the project the steps
   * belong to; the demo project (roadmap 0.10) passes `/demo`, because it has
   * seven stages and deliberately no project document behind them.
   */
  basePath?: string;
}) {
  const router = useRouter();
  const root = basePath ?? `/project/${projectId}`;

  const go = (step: RailStep) => {
    router.push(`${root}/${step.path}`);
    window.scrollTo(0, 0);
  };

  return (
    <nav aria-label="Workflow phases" className="mb-16 relative mx-2 sm:mx-0 print:hidden">
      <ol className="flex items-center justify-between relative z-10">
        {steps.map((step) => {
          const isCurrent = step.key === current;
          const tone = phaseTone(step);
          const paint = PHASE_TONE_CLASS[tone];
          return (
            <li key={step.key} className="flex flex-col items-center relative bg-gray-50 px-1 sm:px-2">
              <button
                type="button"
                onClick={() => go(step)}
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={`Phase ${step.n}, ${step.label}: ${step.detail}`}
                title={`${step.label} — ${step.detail}`}
                data-phase={step.key}
                data-phase-state={step.state}
                data-phase-tone={tone}
                className={clsx(
                  'w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center border-2 text-xs sm:text-sm font-semibold transition-all duration-300 shadow-sm hover:scale-105 outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2',
                  paint.border,
                  paint.surface,
                  paint.ink,
                  isCurrent && 'ring-2 ring-gray-900/30 ring-offset-2 ring-offset-gray-50 scale-110',
                )}
              >
                {step.done ? <Check className="w-4 h-4 sm:w-5 sm:h-5" /> : step.n}
              </button>
              <span
                className={clsx(
                  'absolute -bottom-7 text-[9px] sm:text-xs font-medium uppercase tracking-wider whitespace-nowrap',
                  isCurrent ? 'text-gray-900 block' : 'text-gray-500 hidden sm:block',
                )}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
      {/* One segment per gap, carrying the tone of the phase on its left — not a
          bar filled to the reader's position, and not green for work nothing
          checked. */}
      <div className="absolute top-4 sm:top-5 left-0 w-full h-[2px] flex z-0" aria-hidden>
        {steps.slice(0, -1).map((step) => (
          <div key={step.key} className={clsx('flex-1 h-full', PHASE_TONE_CLASS[phaseTone(step)].fill)} />
        ))}
      </div>
    </nav>
  );
}

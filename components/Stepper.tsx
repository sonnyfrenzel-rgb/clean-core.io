import { Check } from 'lucide-react';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import type { PhaseKey, RailStep } from '@/lib/workflow-steps';

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
 * the rail, the dashboard and the delivery page give. A tick means done, amber
 * means something exists that is not yet the phase's evidence, grey means
 * nothing. The ring marks where the reader is, and says nothing about progress.
 */
export default function Stepper({
  steps,
  current,
  projectId,
}: {
  steps: RailStep[];
  current: PhaseKey;
  projectId: string;
}) {
  const router = useRouter();

  const go = (step: RailStep) => {
    router.push(`/project/${projectId}/${step.path}`);
    window.scrollTo(0, 0);
  };

  return (
    <nav aria-label="Workflow phases" className="mb-16 relative mx-2 sm:mx-0 print:hidden">
      <ol className="flex items-center justify-between relative z-10">
        {steps.map((step) => {
          const isCurrent = step.key === current;
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
                className={clsx(
                  'w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center border-2 text-xs sm:text-sm font-semibold transition-all duration-300 shadow-sm hover:scale-105 outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2',
                  step.state === 'done'
                    ? 'border-green-600 bg-white text-green-600'
                    : step.state === 'partial'
                      ? 'border-amber-400 bg-amber-50 text-amber-700'
                      : 'border-gray-300 bg-white text-gray-400',
                  isCurrent && 'ring-2 ring-green-600/30 ring-offset-2 ring-offset-gray-50 scale-110',
                )}
              >
                {step.done ? <Check className="w-4 h-4 sm:w-5 sm:h-5" /> : step.n}
              </button>
              <span
                className={clsx(
                  'absolute -bottom-7 text-[9px] sm:text-xs font-medium uppercase tracking-wider whitespace-nowrap',
                  isCurrent ? 'text-green-600 block' : 'text-gray-500 hidden sm:block',
                )}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
      {/* One segment per gap, green when the phase on its left is done — not a
          bar filled to the reader's position. */}
      <div className="absolute top-4 sm:top-5 left-0 w-full h-[2px] flex z-0" aria-hidden>
        {steps.slice(0, -1).map((step) => (
          <div key={step.key} className={clsx('flex-1 h-full', step.done ? 'bg-green-600' : 'bg-gray-200')} />
        ))}
      </div>
    </nav>
  );
}

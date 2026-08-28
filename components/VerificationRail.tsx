'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, ListChecks } from 'lucide-react';

/**
 * Where am I, what is behind me, what is still open.
 *
 * A seven-stage flow gives the reader a stepper at the top of each page and then
 * lets them scroll two thousand pixels away from it. This rail keeps the answer
 * on screen: the same seven steps, the same emerald-and-slate circles the stepper
 * already uses, in a column down the right edge.
 *
 * It adds no capability. Every state it shows is one the pages already hold — a
 * signed score, generated code, a test suite, a blueprint — so the rail reports
 * rather than decides, and it never claims a step is done on the strength of the
 * page having been opened, which is the mistake stage 7 used to make.
 *
 * Desktop only by width, but not hidden on a phone: there it becomes a single
 * button at the bottom-left that opens the same list as a sheet. Both are behind
 * `hidden` at the print breakpoint, because a rail is navigation and navigation
 * does not belong in a printed business case.
 */
export interface RailStep {
  /** 1-based, matching the Stepper. */
  n: number;
  label: string;
  path: string;
  /** True when the artefact this step produces exists. */
  done: boolean;
  /** What is on record, in the product's own words. Shown on hover and focus. */
  detail: string;
}

export default function VerificationRail({
  steps,
  current,
  projectId,
}: {
  steps: RailStep[];
  current: number;
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

  const dot = (step: RailStep) => {
    const isCurrent = step.n === current;
    if (isCurrent) {
      return 'border-green-600 bg-white ring-2 ring-green-600/20 ring-offset-2 ring-offset-[#f8f9ff]';
    }
    return step.done ? 'border-green-600 bg-green-600' : 'border-gray-300 bg-white';
  };

  return (
    <>
      {/* ── Desktop: a column at the right edge ─────────────────────────── */}
      <nav
        aria-label="Workflow progress"
        className="hidden 2xl:flex fixed right-5 top-1/2 -translate-y-1/2 z-30 flex-col items-center gap-1 print:hidden"
      >
        {steps.map((step, i) => (
          <div key={step.n} className="flex flex-col items-center">
            <button
              type="button"
              onClick={() => go(step)}
              onMouseEnter={() => setHovered(step.n)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(step.n)}
              onBlur={() => setHovered(null)}
              aria-current={step.n === current ? 'step' : undefined}
              aria-label={`Step ${step.n}, ${step.label}. ${step.detail}`}
              className={`relative h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all hover:scale-110 outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 ${dot(step)}`}
            >
              {step.done && step.n !== current && <Check size={12} className="text-white" strokeWidth={3.5} />}
              {step.n === current && <span className="h-2 w-2 rounded-full bg-green-600" />}

              {/* Left, not right: there is no room on the right. */}
              {hovered === step.n && (
                <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 w-56 rounded-xl border border-gray-200 bg-white p-3 text-left shadow-xl pointer-events-none">
                  <span className="block text-[9px] font-black uppercase tracking-widest text-gray-400">
                    Step {step.n}
                  </span>
                  <span className="block text-sm font-bold text-gray-900 leading-tight mt-0.5">
                    {step.label}
                  </span>
                  <span className="block text-[11px] text-gray-500 leading-relaxed mt-1">
                    {step.detail}
                  </span>
                </span>
              )}
            </button>
            {i < steps.length - 1 && (
              <span
                className={`w-0.5 h-4 ${step.done ? 'bg-green-600/40' : 'bg-gray-200'}`}
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
        aria-label={`Workflow progress: ${doneCount} of ${steps.length} steps have output`}
        className="2xl:hidden fixed left-4 bottom-4 z-30 flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3.5 py-2.5 shadow-lg print:hidden"
      >
        <ListChecks size={15} className="text-green-600" />
        <span className="text-[11px] font-black uppercase tracking-widest text-gray-700 tabular-nums">
          {doneCount} / {steps.length}
        </span>
      </button>

      {open && (
        <div className="2xl:hidden fixed inset-0 z-50 flex items-end print:hidden">
          <button
            type="button"
            aria-label="Close workflow progress"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
          />
          <div className="relative w-full rounded-t-3xl border-t border-gray-200 bg-white p-5 pb-8 shadow-2xl animate-in slide-in-from-bottom duration-200 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Workflow progress</p>
                <p className="text-base font-black text-gray-900 tabular-nums">
                  {doneCount} of {steps.length} steps have output
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <ol className="space-y-1">
              {steps.map((step) => (
                <li key={step.n}>
                  <button
                    type="button"
                    onClick={() => go(step)}
                    aria-current={step.n === current ? 'step' : undefined}
                    className={`flex w-full items-start gap-3 rounded-2xl p-3 text-left transition-colors ${
                      step.n === current ? 'bg-green-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span
                      className={`mt-0.5 h-6 w-6 shrink-0 rounded-full border-2 flex items-center justify-center ${dot(step)}`}
                    >
                      {step.done && step.n !== current && <Check size={12} className="text-white" strokeWidth={3.5} />}
                      {step.n === current && <span className="h-2 w-2 rounded-full bg-green-600" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-gray-900 leading-tight">
                        {step.n}. {step.label}
                      </span>
                      <span className="block text-[11px] text-gray-500 leading-relaxed mt-0.5">
                        {step.detail}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </>
  );
}

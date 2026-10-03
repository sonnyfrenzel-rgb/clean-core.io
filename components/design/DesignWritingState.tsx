'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { DESIGN_GENERATION_CEILING_MS, DESIGN_ON_OPEN_COST } from '@/lib/model-stages';

/**
 * The visible wait while the solution design is written (owner decision
 * 03.10.2026, ADR-070 amendment): what is happening, by whom, the seconds
 * waited against the ceiling, and what it costs — in place of the document
 * when there is none yet, above it when one written for a previous basis is
 * being replaced. The pattern of the project start's narrative wait
 * (`hooks/useStartRun.ts`).
 */
export default function DesignWritingState({
  since,
  step,
  elsewhere = false,
  replacing = false,
}: {
  /** When the wait began (ms since epoch); `null` before the call has started. */
  since: number | null;
  /** The step in progress, when the page knows it. */
  step?: string | null;
  /** Another tab of this browser is writing it. */
  elsewhere?: boolean;
  /** A design written for a previous basis stays on screen until the new one is saved. */
  replacing?: boolean;
}) {
  const ceiling = Math.round(DESIGN_GENERATION_CEILING_MS / 1000);
  const [waited, setWaited] = useState(0);
  useEffect(() => {
    if (since === null) return undefined;
    const tick = () => setWaited(Math.max(0, Math.min(ceiling, Math.floor((Date.now() - since) / 1000))));
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [since, ceiling]);

  return (
    <div
      role="status"
      data-design-writing={elsewhere ? 'elsewhere' : 'here'}
      className="flex flex-col gap-2 rounded-cc-card border border-cc-line bg-cc-surface-muted px-4 py-4 sm:px-6"
    >
      <div className="flex items-start gap-3">
        <RefreshCw size={20} aria-hidden={true} className="mt-0.5 shrink-0 text-cc-ink-muted motion-safe:animate-spin" />
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="m-0 cc-text-h3 text-cc-ink">Writing the solution design (model)…</h3>
          <p className="m-0 text-[13px] text-cc-ink-muted">
            {elsewhere
              ? 'Another tab of this browser is writing it; it appears here when it is saved.'
              : step && step !== 'Writing the solution design (model)…'
                ? step
                : replacing
                  ? 'The design written for the previous basis stays below until the new one is saved.'
                  : 'From the signed engine evidence. The canvas and the requirements below are already read from the code.'}
          </p>
          <p data-design-writing-seconds="" className="m-0 text-[13px] font-semibold text-cc-ink">
            {since === null ? 0 : waited} s waited · {ceiling} s at most
          </p>
          <p data-design-writing-cost="" className="m-0 text-[12px] text-cc-ink-muted">
            {DESIGN_ON_OPEN_COST}
          </p>
        </div>
      </div>
    </div>
  );
}

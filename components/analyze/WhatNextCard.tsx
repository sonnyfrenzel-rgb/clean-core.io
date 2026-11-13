'use client';

import React, { useId, useState, useSyncExternalStore } from 'react';
import { ArrowUp, ChevronRight } from 'lucide-react';
import { PHASE_PURPOSE, PHASES, type PhaseKey } from '@/lib/workflow-steps';
import { whatNextOpenAt } from '@/lib/analyze-progress';
import { switchStageView } from '@/lib/location-search';
import { wt } from '@/lib/workspace-messages';

function subscribeWidth(onChange: () => void): () => void {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

/** The tools after Analyze, in the canonical order; what each does comes from `PHASE_PURPOSE`, the one source. */
const LATER_TOOLS: readonly PhaseKey[] = PHASES.map((p) => p.key).filter((k) => k !== 'analyze');

/**
 * "What you can do next" — the lightweight card below the two endings once the walk-through is done (plan AB-4;
 * owner decisions 06.11.2026 and the 4.1 adjustments (1), (2), (3) = N9; mockup states 9 and 9b; ADR-118).
 *
 *   - **The other views** of the same program, IT and Management, each with what it shows; the way there is the view
 *     switch above ("Use the view switch above", on every viewport).
 *   - **The other tools**, optional, each with the sentence the tool bar uses for it (`PHASE_PURPOSE`).
 *
 * Open from 1024 px; at 768 px and on a phone one collapsed line that opens in place. **"Hide"** takes it away for
 * this project in this browser (`cc.analyze.nextHidden.<id>`, no server field); a quiet link below the endings brings
 * it back. Nothing here is a primary action and nothing is written beyond that flag.
 */
export default function WhatNextCard({
  onView = switchStageView,
  onHide,
}: {
  /** Opens a view: the view switch's own move (`switchStageView`), so the address and the switch agree. */
  onView?: (view: 'it' | 'management') => void;
  onHide: () => void;
}) {
  const bodyId = useId();
  // Open by width until the reader opens or closes it: the server and the first frame show the one line.
  const wide = useSyncExternalStore(subscribeWidth, () => whatNextOpenAt(window.innerWidth), () => false);
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = toggled ?? wide;
  const views: Array<{ view: 'it' | 'management'; name: string; says: string }> = [
    { view: 'it', name: 'IT', says: wt('abiz.nextViewIt') },
    { view: 'management', name: 'Management', says: wt('abiz.nextViewManagement') },
  ];
  return (
    <section
      data-analyze-what-next={open ? 'open' : 'closed'}
      aria-labelledby={`${bodyId}-title`}
      className="cc-no-print rounded-cc-card border border-cc-information-border bg-cc-surface px-4 py-3 shadow-cc"
    >
      <div className="flex items-center gap-3">
        <h2 id={`${bodyId}-title`} className="m-0 text-[15px] leading-snug font-bold text-cc-ink">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setToggled(!open)}
            data-analyze-what-next-toggle=""
            className="inline-flex min-h-8 items-center gap-1 rounded-cc-row text-left pointer-coarse:min-h-11"
          >
            {wt('abiz.nextTitle')}
            <ChevronRight size={16} aria-hidden={true} className={open ? 'rotate-90 text-cc-ink-muted' : 'text-cc-ink-muted'} />
          </button>
        </h2>
        <button
          type="button"
          onClick={onHide}
          data-analyze-what-next-hide=""
          className="ml-auto inline-flex min-h-8 items-center rounded-cc-row text-[13px] font-semibold text-cc-ink-muted underline-offset-2 hover:underline pointer-coarse:min-h-11"
        >
          {wt('abiz.nextHide')}
        </button>
      </div>
      <div id={bodyId} hidden={!open} className="mt-2 grid grid-cols-1 gap-x-6 gap-y-3 min-[1024px]:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-2">
          <h3 className="m-0 text-[13px] font-bold text-cc-ink">{wt('abiz.nextViews')}</h3>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {views.map((v) => (
              <li key={v.view}>
                <button
                  type="button"
                  onClick={() => onView(v.view)}
                  data-analyze-what-next-view={v.view}
                  className="inline-flex items-start gap-2 rounded-cc-row text-left text-[13px] leading-snug font-medium text-cc-ink hover:underline"
                >
                  <ArrowUp size={14} aria-hidden={true} className="mt-0.5 shrink-0 text-cc-ink-muted" />
                  <span>
                    <span className="font-semibold">{v.name}:</span> {v.says}.
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">{wt('abiz.nextViewsNote')}</p>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <h3 className="m-0 text-[13px] font-bold text-cc-ink">
            {wt('abiz.nextTools')} <span className="font-medium text-cc-ink-muted">{wt('abiz.nextToolsOptional')}</span>
          </h3>
          <ul data-analyze-what-next-tools="" className="m-0 flex list-none flex-col gap-1 p-0 text-[13px] leading-snug font-medium text-cc-ink">
            {LATER_TOOLS.map((key) => (
              <li key={key} data-analyze-what-next-tool={key}>
                <span className="font-semibold">{PHASES.find((p) => p.key === key)?.label}:</span> {PHASE_PURPOSE[key]}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

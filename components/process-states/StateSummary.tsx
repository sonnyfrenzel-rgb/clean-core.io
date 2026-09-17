'use client';

import React from 'react';
import { ELEMENT_STATES, STATE_LABELS, statesSentence, type ProcessStates } from '@/lib/process-states';

/**
 * What has been answered so far — roadmap 3.5, the panel on the right of mockup
 * screen s2.
 *
 * Five rows and the fifth is the one that matters: **Not confirmed** counts the
 * subjects with no answer, which is not a fifth state but the absence of one.
 * It is counted over the elements and rules that exist, so it cannot be made to
 * look better by having fewer entries — which is exactly what "undecided =
 * subjects minus entries" would allow.
 *
 * Presentational. `readProcessStates` did the counting, in a pure function a
 * test reads without a browser.
 */

export interface StateSummaryProps {
  states: ProcessStates;
  /** The Bedarfsrevision these counts are as of. 0 when nothing has been confirmed. */
  revision: number;
}

export default function StateSummary({ states, revision }: StateSummaryProps) {
  const rows: Array<{ key: string; label: string; count: number }> = [
    ...ELEMENT_STATES.map((state) => ({ key: state, label: STATE_LABELS[state], count: states.counts[state] })),
    { key: 'undecided', label: 'Not confirmed', count: states.counts.undecided },
  ];

  return (
    <div data-state-summary="" className="flex flex-col gap-2">
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
        {rows.map((row) => (
          <React.Fragment key={row.key}>
            <dt className="text-[13px] font-medium text-cc-ink-muted">{row.label}</dt>
            <dd data-state-count={row.key} className="text-[13px] font-bold text-cc-ink">
              {row.count}
            </dd>
          </React.Fragment>
        ))}
      </dl>
      <p data-state-summary-sentence className="text-[12px] font-medium text-cc-ink-muted">
        {statesSentence(states)}
      </p>
      <p data-state-summary-revision className="text-[12px] font-medium text-cc-ink-muted">
        {revision === 0
          ? 'Nothing has been confirmed yet. The first answer becomes revision 1 of the need.'
          : `Revision ${revision} of the need. Revision 1 of the process stays as it was reconstructed.`}
      </p>
    </div>
  );
}

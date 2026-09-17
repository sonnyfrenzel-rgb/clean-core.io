'use client';

import React from 'react';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcTag } from '@/components/cc/Tag';
import type { ProcessMapLegendEntry } from '@/lib/process-map';

/**
 * The legend — roadmap 2.5: Reconstructed · Confirmed · Proven.
 *
 * Every entry carries the count the **file** states, not a count this component
 * assembles: the status of each element is read out of `cc:trace/@status` in the
 * BPMN of 2.6. Today that is `reconstructed` on everything, so Confirmed and
 * Proven read `0` — and they are shown at zero rather than hidden, because a
 * legend that only lists what happens to be on screen teaches a reader nothing
 * about what the colours of this product mean. The sentence under the legend
 * says why the two are empty instead of leaving it to be guessed.
 *
 * `Unanchored` sits beside them and is deliberately *not* a provenance chip: it
 * is not a fourth kind of origin but the absence of evidence for one element,
 * and `DESIGN.md` §4.1 gives each list its own shape so that nothing looks like
 * a provenance badge that is not one.
 */
export interface ProcessMapLegendProps {
  entries: readonly ProcessMapLegendEntry[];
  unanchored: number;
  unanchoredLabel: string;
}

export default function ProcessMapLegend({ entries, unanchored, unanchoredLabel }: ProcessMapLegendProps) {
  const empty = entries.filter((entry) => entry.count === 0).map((entry) => entry.label);

  return (
    <div data-process-map-legend="" className="flex flex-col gap-1.5">
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {entries.map((entry) => (
          <li key={entry.value} data-legend-entry={entry.value} className="flex items-center gap-1.5">
            <CcProvenanceChip value={entry.value} />
            <span className="text-[12px] font-semibold text-cc-ink" data-legend-count={entry.value}>
              {entry.count}
            </span>
          </li>
        ))}
        <li data-legend-entry="unanchored" className="flex items-center gap-1.5">
          <CcTag>{unanchoredLabel}</CcTag>
          <span className="text-[12px] font-semibold text-cc-ink" data-legend-count="unanchored">
            {unanchored}
          </span>
        </li>
      </ul>
      {empty.length > 0 ? (
        <p className="text-[12px] font-medium text-cc-ink-muted">
          {empty.join(' and ')} {empty.length === 1 ? 'is' : 'are'} empty: this map is read out of the code.
          Nobody has confirmed a step of it, and nothing in it has been shown to run.
        </p>
      ) : null}
    </div>
  );
}

'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { objectStatus, type ObjectStatusValue } from '@/lib/object-status';
import { STATE_CLASSES } from './state';
import { CcStateDot } from './StateText';

/**
 * How far something has got — `DESIGN.md` §2.3, §4.1.
 *
 * Text with a state dot, no outline, no icon. That is not a styling preference:
 * it is what keeps an object status from being mistaken for a provenance chip
 * (ADR-023). A status says *how far*, a chip says *where from*, and the status
 * line of a workspace shows seven of the first kind next to several of the
 * second.
 *
 * The dot is never the only cue — the word is always there (§2.4, "Status als
 * Text mit Punkt — nie nur Farbe"). "not started" and "open" get a hollow dot,
 * because a filled dot reads as a result and neither of them is one.
 *
 * The dot is `CcStateDot`, shared with `CcStateText` — the same shape for a
 * state that is not on this list. Dot and word stand 4 px apart (the grid of
 * §1.3; it was 6 px, a half step, until D.5e).
 */
export interface CcObjectStatusProps {
  value: ObjectStatusValue;
  /** What the status is about — "Provenance", "Costs". Rendered before it. */
  facet?: string;
}

export default function CcObjectStatus({ value, facet }: CcObjectStatusProps) {
  const entry = objectStatus(value);
  const state = STATE_CLASSES[entry.state];

  return (
    <span
      data-cc-object-status={entry.value}
      className="inline-flex items-center gap-2 text-[12px] font-semibold whitespace-nowrap"
    >
      {facet ? <span className="text-cc-ink-muted font-medium">{facet}</span> : null}
      <span className={cn('inline-flex items-center gap-1', state.text)}>
        <CcStateDot state={entry.state} hollow={entry.hollow} />
        <span data-cc-object-status-label>{entry.label}</span>
      </span>
    </span>
  );
}

'use client';

import React from 'react';
import { Lightbulb } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import type { CoachMark, CoachMarkId } from '@/lib/coach-marks';

/**
 * One coach mark, where it belongs — `DESIGN.md` §6.2, roadmap 2.7.
 *
 * **Inline, not floating.** A coach mark is normally a bubble pinned to a
 * coordinate. This one is rendered in the flow, directly above the thing it is
 * about, for two reasons that are not laziness: a pinned bubble has to be
 * re-measured on every resize, fold and font change and is the first thing to
 * break on a phone (§2.9); and a bubble that is `position: fixed` reaches the
 * keyboard only if somebody remembers to move the focus, which is the half that
 * gets forgotten. In the flow, Tab reaches it because it is next.
 *
 * **One at a time** (§6.1.2: *immer nur eine*). Which one is decided once for
 * the whole screen by `hooks/useCoachMarks.ts`; this component renders the mark
 * it is handed if the slot is the mark's own, and nothing otherwise. The state
 * is in the browser and only in the browser (ADR-036) — there is no account
 * field behind any of this, and so no `firestore.rules` change either.
 */
export default function CoachMarkNote({
  mark,
  slot,
  onDismiss,
  onDismissAll,
}: {
  mark: CoachMark | null;
  /** Which place on the page is asking. */
  slot: CoachMarkId;
  onDismiss: (id: CoachMarkId) => void;
  onDismissAll: () => void;
}) {
  if (!mark || mark.id !== slot) return null;

  return (
    <div
      data-coach-mark={mark.id}
      role="note"
      aria-label={mark.title}
      className="mb-2 flex flex-wrap items-start gap-2.5 rounded-cc-row border border-cc-information-border bg-cc-information-bg px-3 py-2"
    >
      <span aria-hidden={true} className="mt-0.5 shrink-0 text-cc-information">
        <Lightbulb size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <b data-coach-mark-title="" className="text-[13px] font-semibold text-cc-ink">
          {mark.title}
        </b>
        <span className="block text-[12px] leading-snug font-medium text-cc-ink-muted">
          {mark.body}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <CcButton onClick={() => onDismiss(mark.id)} data-coach-mark-dismiss={mark.id}>
          Got it
        </CcButton>
        <CcButton onClick={onDismissAll} data-coach-mark-dismiss-all="">
          Skip tips
        </CcButton>
      </span>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  availableCoachMarks,
  clearDismissedMarks,
  nextCoachMark,
  readDismissedMarks,
  writeDismissedMarks,
  type CoachMark,
  type CoachMarkContext,
  type CoachMarkId,
} from '@/lib/coach-marks';

/**
 * The three coach marks, held once for the whole screen — `DESIGN.md` §6.2.
 *
 * One hook rather than one component per place, and the reason is a bug that
 * was in the first draft of this step: three components each reading
 * `localStorage` on mount is three copies of "what has been dismissed", and
 * dismissing the first mark leaves the other two holding a stale list. They then
 * all decide that the current mark is not theirs, and the tips vanish without
 * anybody dismissing them. The state belongs to the screen, so it lives here and
 * the components render what they are handed.
 *
 * Storage is `localStorage` and only `localStorage` (ADR-036) — see
 * `lib/coach-marks.ts` for why the account is deliberately not involved.
 */
export interface CoachMarkState {
  /** The one mark to show now, or null. Never two (§6.1.2: *immer nur eine*). */
  current: CoachMark | null;
  /** True once storage has been read — before that nothing is rendered. */
  ready: boolean;
  dismiss: (id: CoachMarkId) => void;
  dismissAll: () => void;
  /** "Show tips again" in the help menu, §6.2. */
  reset: () => void;
  /** False when every available mark has been dismissed. */
  anyLeft: boolean;
}

export function useCoachMarks(context: CoachMarkContext): CoachMarkState {
  // `null` until the effect has read storage: showing a tip and taking it away
  // again is worse than showing it one frame late, and the server has no
  // `localStorage` to read during the first pass anyway.
  const [dismissed, setDismissed] = useState<CoachMarkId[] | null>(null);

  useEffect(() => {
    setDismissed(readDismissedMarks());
  }, []);

  // Destructured, not passed whole: the caller builds the context object inline,
  // so a dependency on the object itself is a new array on every render.
  const { hasDecision, hasNextStep } = context;
  const available = useMemo(
    () => availableCoachMarks({ hasDecision, hasNextStep }),
    [hasDecision, hasNextStep],
  );

  const current = dismissed === null ? null : nextCoachMark(available, dismissed);

  const dismiss = useCallback((id: CoachMarkId) => {
    setDismissed((prev) => {
      const next = [...new Set([...(prev ?? []), id])];
      writeDismissedMarks(next);
      return next;
    });
  }, []);

  const dismissAll = useCallback(() => {
    const all = available.map((m) => m.id);
    setDismissed(all);
    writeDismissedMarks(all);
  }, [available]);

  const reset = useCallback(() => {
    clearDismissedMarks();
    setDismissed([]);
  }, []);

  return {
    current,
    ready: dismissed !== null,
    dismiss,
    dismissAll,
    reset,
    anyLeft: current !== null,
  };
}

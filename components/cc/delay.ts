'use client';

import { useEffect, useState } from 'react';

/**
 * The two thresholds of `DESIGN.md` §2.8, in one place.
 *
 * A skeleton appears when loading takes longer than 300 ms; a busy indicator on
 * the element that started an action appears after 400 ms. Below that, showing
 * anything is worse than showing nothing: a placeholder that flashes for 80 ms
 * reads as a flicker, and a spinner that blinks on every fast save teaches the
 * reader that saving is slow.
 */
export const CC_SKELETON_DELAY_MS = 300;
export const CC_BUSY_DELAY_MS = 400;

/**
 * `true` once `active` has been true for `delayMs` without interruption, and
 * `false` again the moment it stops. The state that is announced (`aria-busy`)
 * follows `active` directly; only what is *painted* waits.
 */
export function useCcDelayedFlag(active: boolean, delayMs: number): boolean {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setShown(true), delayMs);
    // Reset when the activity ends, so the next one waits its full delay again.
    return () => {
      window.clearTimeout(timer);
      setShown(false);
    };
  }, [active, delayMs]);

  return active && shown;
}

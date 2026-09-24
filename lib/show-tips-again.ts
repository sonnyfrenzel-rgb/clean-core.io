import { clearDismissedMarks } from '@/lib/coach-marks';
import { clearTourProgress } from '@/lib/demo-tour';

/**
 * "Show tips again" in the help menu — `DESIGN.md` §6.2, §6.1.2, roadmap 3.0.7.
 *
 * One entry brings back both kinds of tip: the three coach marks of an own
 * project and the demo tour, which starts again from its first station. Both
 * live in this browser only (ADR-036), so this clears two `localStorage` keys
 * and tells whatever screen is open, through a window event, to read them
 * again — a screen that holds the dismissed list in state would otherwise keep
 * the tips hidden until the next navigation.
 *
 * No account field, no route, no write anywhere else.
 */
export const SHOW_TIPS_EVENT = 'cc-show-tips-again';

export function showTipsAgain(): void {
  clearDismissedMarks();
  clearTourProgress();
  try {
    window.dispatchEvent(new CustomEvent(SHOW_TIPS_EVENT));
  } catch {
    /* no window — nothing on screen to tell */
  }
}

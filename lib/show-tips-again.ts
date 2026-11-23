import { clearTourProgress } from '@/lib/demo-tour';

/**
 * "Show tips again" in the help menu — `DESIGN.md` §6.2, §6.1.2, roadmap 3.0.7.
 *
 * It brings back the demo tour, which starts again from its first station. The
 * coach marks of an own project retired with the workspace page (3.5.0, AB-11,
 * plan P7): Analyze's walk-through and its invitation do their job. The tour
 * lives in this browser only (ADR-036), so this clears its `localStorage` key
 * and tells whatever screen is open, through a window event, to read it again.
 *
 * No account field, no route, no write anywhere else.
 */
export const SHOW_TIPS_EVENT = 'cc-show-tips-again';

export function showTipsAgain(): void {
  clearTourProgress();
  try {
    window.dispatchEvent(new CustomEvent(SHOW_TIPS_EVENT));
  } catch {
    /* no window — nothing on screen to tell */
  }
}

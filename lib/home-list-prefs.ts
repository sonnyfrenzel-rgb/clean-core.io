/**
 * The one convenience of the home page's project list this browser remembers (AB-14b, mockup state "Figures on"):
 * whether the row's figures — lines, findings, levels, score, rules — are shown under each row. Never stored on an
 * account, a project, a run or anywhere a server sees it. A browser that refuses storage starts with the figures off
 * each time.
 *
 * The key must be named in the Privacy Policy's list of local-storage keys before this reaches `main`
 * (`lib/legal/texts/privacy.en.ts` / `.de.ts`, the list that names `cc.workspace.coachMarks.dismissed`). The legal
 * texts are not edited here; {@link HOME_PRIVACY_PENDING_STORAGE_KEYS} is the register of what that text has to
 * add, and `tests/home-rows.spec.ts` holds it: a key leaves the register once the published text names it. Owner
 * question with the release: name it in privacy 1.3, or let the switch forget on every visit.
 *
 * What the key holds — nothing personal, nothing about a project: `cc.workspace.figures`, `on` or absent.
 */
import { useSyncExternalStore } from 'react';

export const HOME_FIGURES_KEY = 'cc.workspace.figures';

/** Local-storage keys AB-14b adds that the Privacy Policy's list does not name yet. */
export const HOME_PRIVACY_PENDING_STORAGE_KEYS: readonly string[] = [HOME_FIGURES_KEY];

export function readHomeFigures(): boolean {
  try {
    return window.localStorage.getItem(HOME_FIGURES_KEY) === 'on';
  } catch {
    return false;
  }
}

const noSubscription = () => () => {};

/** The stored switch, hydration-safe: a server render reads "off"; every browser render after it reads the storage. */
export function useStoredHomeFigures(): boolean {
  return useSyncExternalStore(noSubscription, readHomeFigures, () => false);
}

export function rememberHomeFigures(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(HOME_FIGURES_KEY, 'on');
    else window.localStorage.removeItem(HOME_FIGURES_KEY);
  } catch {
    /* not remembered: nothing else depends on it */
  }
}

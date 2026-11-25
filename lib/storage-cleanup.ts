import { RETIRED_COACH_MARKS_KEY } from './storage-keys';

/**
 * Removes the browser storage entries the app no longer uses (`STORAGE_CLEANUPS` in `lib/storage-keys.ts`), once per
 * page load of a signed-in visit — `lib/firebase-app.ts` calls it when Firebase reports an account.
 *
 * Lawyer, statement 22c, 1: the leftover `cc.workspace.coachMarks.dismissed` from the workspace page that 3.5.0
 * removed is deleted in code; privacy policy 1.5 says nothing about it (no general promise to remove old entries).
 * Removing a key that is not there is harmless, so the call needs no marker of its own. Every access is wrapped:
 * storage can be blocked or absent.
 */
let done = false;

export function removeRetiredStorageEntries(): void {
  if (done) return;
  done = true;
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(RETIRED_COACH_MARKS_KEY);
  } catch {
    // Blocked storage: nothing was stored there either.
  }
}

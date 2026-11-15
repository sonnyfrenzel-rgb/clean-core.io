import { hasSignedInHint } from './auth-hint';

/**
 * A tab from the previous build (roadmap 3.0.6, decision Sonny 07.10.2026).
 *
 * After a deploy a tab opened on the previous build either asks for chunk hashes
 * that no longer exist, or runs a chunk of the new build against the old runtime.
 * Every error boundary that can catch this (`app/error.tsx` and the project's
 * one boundary for the workspace and its seven tools, roadmap 3.0.21 (7))
 * reloads once; when that one reload is spent, it says "A new version of
 * Clean-Core.io is available" with a reload button instead of a crash card with
 * the raw message — after the 3.0.5 deploy an open 3.0.4 tab read like a crash.
 *
 * One module, so the boundaries cannot drift apart again (the two stage copies
 * there used to be had lost the mixed-build patterns).
 */

/** True when the error is one build meeting another, not a bug in this build. */
export function isStaleBuildError(error: { name?: string; message?: string } | null | undefined): boolean {
  const msg = error?.message || '';
  return (
    error?.name === 'ChunkLoadError' ||
    /Loading chunk [\w-]+ failed|ChunkLoadError|error loading dynamically imported module|Failed to fetch dynamically imported module|Importing a module script failed/i.test(msg) ||
    // Two builds mixed in one tab: a chunk of the new build asks the old
    // runtime for a module it does not have ("reading 'call'"), or calls an
    // export under a name the other build mangled differently.
    /reading 'call'\)|^\(0\s*,\s*[\w$]+\.[\w$]+\) is not a function/.test(msg)
  );
}

/** Written for a signed-in reader only (see `reloadOnceForStaleBuild`). */
const KEY = 'cc_chunk_reload_at';

/** How long after a key pressed in a field the reader still counts as typing. */
export const TYPING_PAUSE_MS = 5_000;

let lastTypedAt = 0;

/** Called by the shell (`components/NewVersionWatcher.tsx`) on every key pressed in a field. */
export function markTyping(at: number = Date.now()): void {
  lastTypedAt = at;
}

/** True within `TYPING_PAUSE_MS` of a key pressed in a field. */
export function readerIsTyping(now: number = Date.now()): boolean {
  return lastTypedAt > 0 && now - lastTypedAt < TYPING_PAUSE_MS;
}

/**
 * How this document was loaded, as the browser recorded it: `'reload'` when it
 * came from a reload — the one this module triggers, or the reader's own.
 * Null where the Navigation Timing API is absent (the server, an old browser).
 */
function navigationType(): string | null {
  try {
    const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return entry?.type ?? null;
  } catch {
    return null;
  }
}

/**
 * Reloads the tab once to pull the current build. Returns true when it
 * reloaded, false when the reload is spent (or cannot be guarded) and the
 * boundary has to say so instead.
 *
 * The loop guard depends on whether anyone is signed in (privacy policy
 * section 7, release 3.2.0: without sign-in the browser is left as it was — no
 * session storage):
 *
 * - **Signed in** (the hint `cc.auth.signedIn`, lib/auth-hint.ts): a time in
 *   sessionStorage (`cc_chunk_reload_at`) keeps it to one reload per ten
 *   seconds, across the client-side navigations of the app. Section 7 names
 *   the key among what signing in adds.
 * - **Not signed in**: nothing is written. The browser's own record of how
 *   this document was loaded is the guard: a document that came from a reload
 *   does not reload again, so a build that keeps failing stops after one
 *   reload and shows the card. The cost is that a page the reader reloaded by
 *   hand shows the card at once instead of reloading for them.
 *
 * Never while the reader is typing (roadmap 3.0.21 (8)): a reload drops what is
 * in a field, so inside a few seconds of a key pressed in one the boundary shows
 * the "new version" card with its own Reload button instead.
 */
export function reloadOnceForStaleBuild(now: number = Date.now()): boolean {
  if (typeof window === 'undefined') return false;
  if (readerIsTyping(now)) return false;
  if (!hasSignedInHint()) {
    const loadedBy = navigationType();
    if (loadedBy === null || loadedBy === 'reload') return false;
    window.location.reload();
    return true;
  }
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last > 10000) {
      sessionStorage.setItem(KEY, String(Date.now()));
      window.location.reload();
      return true;
    }
  } catch {
    // Storage blocked: no loop guard, so no automatic reload — the notice offers it.
  }
  return false;
}
